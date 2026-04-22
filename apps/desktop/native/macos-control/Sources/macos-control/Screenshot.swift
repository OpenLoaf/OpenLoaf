import Foundation
import CoreGraphics
import AppKit
import ScreenCaptureKit

enum Screenshot {
  // Sync wrapper around SCScreenshotManager — blocks the caller thread via a semaphore.
  // Helper process is single-threaded request/response so this is safe.
  static func captureMainDisplayPNG(to path: String) throws -> (width: Int, height: Int) {
    let sem = DispatchSemaphore(value: 0)
    var result: Result<(CGImage, Int, Int), Error> = .failure(HelperError.runtime("uninitialized"))

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
        cfg.showsCursor = true
        let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
        result = .success((cgImage, cgImage.width, cgImage.height))
      } catch {
        result = .failure(error)
      }
      sem.signal()
    }
    sem.wait()

    let (cgImage, w, h) = try result.get()
    try writePNG(cgImage, to: path)
    return (w, h)
  }

  /// Capture only the frontmost on-screen window owned by `pid`.
  /// Returns nil when no suitable window is found (hidden, minimized, or off-screen);
  /// callers should fall back to a full-display capture.
  static func captureAppWindowPNG(pid: pid_t, to path: String) throws -> (width: Int, height: Int)? {
    let sem = DispatchSemaphore(value: 0)
    var result: Result<(CGImage, Int, Int)?, Error> = .success(nil)

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
        result = .success((cgImage, cgImage.width, cgImage.height))
      } catch {
        result = .failure(error)
      }
      sem.signal()
    }
    sem.wait()

    guard let hit = try result.get() else { return nil }
    try writePNG(hit.0, to: path)
    return (hit.1, hit.2)
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
