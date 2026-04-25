import Foundation
import CoreGraphics
import AppKit
import ScreenCaptureKit

enum Screenshot {
  // Window metadata returned by listWindows. windowID is a stable handle used
  // by captureWindow for per-window capture that ignores z-order (a preview
  // window sitting in front of the main app window no longer masks it).
  struct WindowInfo {
    let windowID: CGWindowID
    let title: String
    let bounds: CGRect
    let isOnScreen: Bool
    let layer: Int
    let ownerPID: pid_t
    let ownerName: String
    let ownerBundleID: String?
  }

  private enum FilterMode { case capture, list }

  // Window filtering rules adapted from Peekaboo's WindowFiltering.swift (MIT,
  // steipete/Peekaboo) — layer==0 drops panels/HUDs, size floor drops
  // tooltips/shadows. Capture mode is stricter (on-screen + larger size) than
  // list mode so AI can see inactive windows but we only render live ones by
  // default.
  private static func isRenderable(_ w: SCWindow, mode: FilterMode) -> Bool {
    if w.windowLayer != 0 { return false }
    let minW: CGFloat = mode == .capture ? 120 : 60
    let minH: CGFloat = mode == .capture ? 90 : 60
    if w.frame.width < minW || w.frame.height < minH { return false }
    if mode == .capture && !w.isOnScreen { return false }
    return true
  }

  // Sync wrapper around SCShareableContent.
  // onScreenWindowsOnly:false lets callers see minimized windows too — the
  // actual on-screen check is delegated to isRenderable per mode.
  static func listWindows(appFilter: String?) throws -> [WindowInfo] {
    let sem = DispatchSemaphore(value: 0)
    var result: Result<[WindowInfo], Error> = .failure(HelperError.runtime("uninitialized"))

    Task.detached {
      do {
        let content = try await SCShareableContent.excludingDesktopWindows(
          false, onScreenWindowsOnly: false)
        let items = content.windows.compactMap { (w: SCWindow) -> WindowInfo? in
          guard let owner = w.owningApplication else { return nil }
          if !Self.isRenderable(w, mode: .list) { return nil }
          if let filter = appFilter, !filter.isEmpty {
            let f = filter.lowercased()
            let nameMatch = owner.applicationName.lowercased() == f
            let bundleMatch = owner.bundleIdentifier.lowercased() == f
            if !nameMatch && !bundleMatch { return nil }
          }
          return WindowInfo(
            windowID: w.windowID,
            title: w.title ?? "",
            bounds: w.frame,
            isOnScreen: w.isOnScreen,
            layer: w.windowLayer,
            ownerPID: owner.processID,
            ownerName: owner.applicationName,
            ownerBundleID: owner.bundleIdentifier
          )
        }
        result = .success(items)
      } catch {
        result = .failure(error)
      }
      sem.signal()
    }
    sem.wait()
    return try result.get()
  }

  // Per-window screenshot by stable windowID. Uses SCContentFilter's
  // desktopIndependentWindow mode so Window Server pulls the window's
  // composition buffer directly — z-order does not matter, a window covered
  // by another app's window still captures correctly. Adapted from Peekaboo
  // ScreenCaptureService.swift:901-970 (MIT).
  static func captureWindow(windowID: CGWindowID, to path: String)
    throws -> (width: Int, height: Int, frame: CGRect)?
  {
    let sem = DispatchSemaphore(value: 0)
    var result: Result<(CGImage, Int, Int, CGRect)?, Error> = .success(nil)

    Task.detached {
      do {
        let content = try await SCShareableContent.excludingDesktopWindows(
          false, onScreenWindowsOnly: false)
        guard let win = content.windows.first(where: { $0.windowID == windowID }) else {
          result = .success(nil); sem.signal(); return
        }
        let filter = SCContentFilter(desktopIndependentWindow: win)
        let cfg = SCStreamConfiguration()
        let scale = 2
        cfg.width = min(Int(win.frame.width) * scale, 6000)
        cfg.height = min(Int(win.frame.height) * scale, 6000)
        cfg.scalesToFit = true
        cfg.showsCursor = false
        cfg.capturesAudio = false
        let cgImage = try await SCScreenshotManager.captureImage(
          contentFilter: filter, configuration: cfg)
        result = .success((cgImage, cgImage.width, cgImage.height, win.frame))
      } catch {
        result = .failure(error)
      }
      sem.signal()
    }
    sem.wait()

    guard let hit = try result.get() else { return nil }
    try writePNG(hit.0, to: path)
    return (hit.1, hit.2, hit.3)
  }

  // Sync wrapper around SCScreenshotManager — blocks the caller thread via a semaphore.
  // Helper process is single-threaded request/response so this is safe.
  //
  // Returns the screenshot's source region in *logical screen coordinates* (the
  // same space CGEvent uses for click/scroll). Server-side coordinate
  // conversion (screenshot pixels → screen coords) relies on this being
  // authoritative — we capture it from SCK's CGRect directly rather than
  // letting downstream infer scale from pixel dimensions.
  static func captureMainDisplayPNG(to path: String) throws -> (width: Int, height: Int, frame: CGRect) {
    let sem = DispatchSemaphore(value: 0)
    var result: Result<(CGImage, Int, Int, CGRect), Error> = .failure(HelperError.runtime("uninitialized"))

    Task.detached {
      do {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
          result = .failure(HelperError.runtime("No display available"))
          sem.signal(); return
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.width = display.width * 2
        cfg.height = display.height * 2
        // Without scalesToFit the source renders 1:1 top-left and leaves the
        // rest of the oversized buffer black — model sees only 1/4 of the
        // screen and clicks blind.
        cfg.scalesToFit = true
        cfg.showsCursor = true
        let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
        result = .success((cgImage, cgImage.width, cgImage.height, display.frame))
      } catch {
        result = .failure(error)
      }
      sem.signal()
    }
    sem.wait()

    let (cgImage, w, h, frame) = try result.get()
    try writePNG(cgImage, to: path)
    return (w, h, frame)
  }

  /// Capture only the frontmost on-screen window owned by `pid`.
  /// Returns nil when no suitable window is found (hidden, minimized, or off-screen);
  /// callers should fall back to a full-display capture. The returned `frame`
  /// is `SCWindow.frame` — logical screen coords — authoritative for server
  /// coordinate conversion (no AX-tree reverse engineering needed).
  static func captureAppWindowPNG(pid: pid_t, to path: String) throws -> (width: Int, height: Int, frame: CGRect)? {
    let sem = DispatchSemaphore(value: 0)
    var result: Result<(CGImage, Int, Int, CGRect)?, Error> = .success(nil)

    Task.detached {
      do {
        let content = try await SCShareableContent.current
        // Pick windows that belong to pid, are on-screen, and large enough to
        // be the "real" window (skip 1×1 shadow/helper windows). SCK returns
        // them in front-to-back order, so the first hit is the frontmost.
        let candidates = content.windows.filter { win in
          guard win.owningApplication?.processID == pid else { return false }
          if !win.isOnScreen { return false }
          if win.frame.width < 40 || win.frame.height < 40 { return false }
          return true
        }
        guard let win = candidates.first else {
          result = .success(nil); sem.signal(); return
        }
        let filter = SCContentFilter(desktopIndependentWindow: win)
        let cfg = SCStreamConfiguration()
        // 2× for retina parity with full-display capture. Clamp to reasonable
        // maxima so gigantic windows don't OOM. scalesToFit=true ensures
        // non-retina windows (Qt/Electron with 1× backing) fill the buffer
        // instead of leaving the right/bottom 3/4 as black padding.
        let scale = 2
        cfg.width = min(Int(win.frame.width) * scale, 6000)
        cfg.height = min(Int(win.frame.height) * scale, 6000)
        cfg.scalesToFit = true
        cfg.showsCursor = false
        cfg.capturesAudio = false
        let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
        result = .success((cgImage, cgImage.width, cgImage.height, win.frame))
      } catch {
        result = .failure(error)
      }
      sem.signal()
    }
    sem.wait()

    guard let hit = try result.get() else { return nil }
    try writePNG(hit.0, to: path)
    return (hit.1, hit.2, hit.3)
  }

  private static func writePNG(_ cgImage: CGImage, to path: String) throws {
    let rep = NSBitmapImageRep(cgImage: cgImage)
    guard let data = rep.representation(using: .png, properties: [:]) else {
      throw HelperError.runtime("PNG encode failed")
    }
    let url = URL(fileURLWithPath: path)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                            withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
  }
}
