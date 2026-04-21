import Foundation
import ApplicationServices
import CoreGraphics

enum Permissions {
  static func missing() -> [String] {
    var out: [String] = []
    if !AXIsProcessTrusted() { out.append("accessibility") }
    if !CGPreflightScreenCaptureAccess() { out.append("screen") }
    return out
  }

  // Fire a request so macOS shows the TCC prompt on first run.
  static func ensurePrompt() {
    let opts: CFDictionary = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(opts)
    _ = CGRequestScreenCaptureAccess()
  }
}
