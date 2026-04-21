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

    let rep = NSBitmapImageRep(cgImage: cgImage)
    guard let data = rep.representation(using: .png, properties: [:]) else {
      throw HelperError.runtime("PNG encode failed")
    }
    let url = URL(fileURLWithPath: path)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                            withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
    return (w, h)
  }
}
