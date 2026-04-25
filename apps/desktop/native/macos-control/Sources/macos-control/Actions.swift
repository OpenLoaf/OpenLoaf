import Foundation
import CoreGraphics
import ApplicationServices
import AppKit

// CGEvent-based synthetic input + AXPerformAction wrapper.
// All calls are synchronous. A 150ms settle runs after synthetic events so the
// caller's next `observe` sees the UI after it finished reacting.
enum Actions {
  static func execute(_ action: ActionPayload) throws -> [String: Any] {
    switch action.type {
    case "click":    return try click(action)
    case "type":     return try typeText(action)
    case "key":      return try keyChord(action)
    case "scroll":   return try scroll(action)
    case "drag":     return try drag(action)
    case "wait":     return try wait(action)
    case "ax_action":return try axAction(action)
    case "menu_click":return try menuClick(action)
    default:
      throw HelperError.badRequest("Unknown action type: \(action.type)")
    }
  }

  // Safety preflight for ref-based clicks. Window chrome buttons
  // (close/minimize/zoom) are near-guaranteed to destroy the current context —
  // and on self-drawn apps (WeChat / QQ / Feishu) they are the *only* AX
  // children the model can see, which is a classic "AI guesses path ['0','0']
  // and closes the window" trap. Refuse these clicks unless the caller
  // explicitly sets confirm_window_chrome=true. Coordinate clicks are not
  // checked — those require the model to have read the pixel from a
  // screenshot, which is a much higher bar than guessing a path.
  private static let destructiveChromeSubroles: Set<String> = [
    "AXCloseButton",
    "AXMinimizeButton",
    "AXZoomButton",
    "AXFullScreenButton",
  ]

  private static func axStringAttr(_ el: AXUIElement, _ attr: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, attr as CFString, &value) == .success else { return nil }
    return value as? String
  }

  private static func preflightClick(_ a: ActionPayload) throws {
    guard let ref = a.ref else { return }
    if a.confirmWindowChrome == true { return }
    let el: AXUIElement
    do {
      el = try AXTree.resolve(ref: ref)
    } catch {
      // Let the downstream resolvePoint surface the resolve error — don't mask
      // it behind a preflight failure.
      return
    }
    let subrole = axStringAttr(el, kAXSubroleAttribute) ?? ""
    guard destructiveChromeSubroles.contains(subrole) else { return }
    let role = axStringAttr(el, kAXRoleAttribute) ?? ""
    let title = axStringAttr(el, kAXTitleAttribute) ?? ""
    throw HelperError.blocked(
      code: "WINDOW_CHROME_BLOCKED",
      message: "Refusing to AXPress window-chrome button " +
               "(role=\(role) subrole=\(subrole) title=\"\(title)\"). " +
               "Clicking this will close/minimize/zoom the window and lose " +
               "the current context. To force anyway, retry with " +
               "confirm_window_chrome=true.")
  }

  // ---- click ----
  private static func click(_ a: ActionPayload) throws -> [String: Any] {
    try preflightClick(a)
    let pt = try resolvePoint(ref: a.ref, point: a.point)
    let button: CGMouseButton = (a.button == "right") ? .right : .left
    let downType: CGEventType = (button == .right) ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = (button == .right) ? .rightMouseUp : .leftMouseUp
    let clicks = max(1, a.clicks ?? 1)
    for i in 0..<clicks {
      let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: pt, mouseButton: button)
      down?.setIntegerValueField(.mouseEventClickState, value: Int64(i + 1))
      down?.post(tap: .cghidEventTap)
      let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: pt, mouseButton: button)
      up?.setIntegerValueField(.mouseEventClickState, value: Int64(i + 1))
      up?.post(tap: .cghidEventTap)
      Thread.sleep(forTimeInterval: 0.02)
    }
    settle()
    return ["action": "click", "point": ["x": pt.x, "y": pt.y], "clicks": clicks]
  }

  // ---- type ----
  private static func typeText(_ a: ActionPayload) throws -> [String: Any] {
    guard let text = a.text else { throw HelperError.badRequest("type requires text") }
    // Use CGEventKeyboardSetUnicodeString so we can emit arbitrary Unicode (CJK etc).
    let src = CGEventSource(stateID: .hidSystemState)
    for scalar in text.unicodeScalars {
      let down = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: true)
      let up = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: false)
      var u = UniChar(scalar.value & 0xFFFF)
      down?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &u)
      up?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &u)
      down?.post(tap: .cghidEventTap)
      up?.post(tap: .cghidEventTap)
    }
    settle()
    return ["action": "type", "length": text.count]
  }

  // ---- key chord (e.g. ["cmd","space"], ["cmd","shift","p"]) ----
  private static func keyChord(_ a: ActionPayload) throws -> [String: Any] {
    guard let keys = a.keys, !keys.isEmpty else { throw HelperError.badRequest("key requires keys[]") }
    var flags = CGEventFlags()
    var mainCode: CGKeyCode? = nil
    for k in keys {
      switch k.lowercased() {
      case "cmd", "command": flags.insert(.maskCommand)
      case "shift":          flags.insert(.maskShift)
      case "alt", "option":  flags.insert(.maskAlternate)
      case "ctrl", "control":flags.insert(.maskControl)
      case "fn":             flags.insert(.maskSecondaryFn)
      default:
        guard let code = KeyMap.code(for: k) else {
          throw HelperError.badRequest("Unknown key: \(k)")
        }
        mainCode = code
      }
    }
    guard let code = mainCode else {
      throw HelperError.badRequest("key requires at least one non-modifier key")
    }
    let src = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: true)
    down?.flags = flags
    down?.post(tap: .cghidEventTap)
    let up = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: false)
    up?.flags = flags
    up?.post(tap: .cghidEventTap)
    settle()
    return ["action": "key", "keys": keys]
  }

  // ---- scroll ----
  private static func scroll(_ a: ActionPayload) throws -> [String: Any] {
    guard let pt = a.point else { throw HelperError.badRequest("scroll requires point") }
    let dy = Int32(a.dy ?? 0)
    let dx = Int32(a.dx ?? 0)
    let mouseMove = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
                            mouseCursorPosition: CGPoint(x: pt.x, y: pt.y), mouseButton: .left)
    mouseMove?.post(tap: .cghidEventTap)
    let evt = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2,
                      wheel1: dy, wheel2: dx, wheel3: 0)
    evt?.post(tap: .cghidEventTap)
    settle()
    return ["action": "scroll", "dx": dx, "dy": dy]
  }

  // ---- drag ----
  private static func drag(_ a: ActionPayload) throws -> [String: Any] {
    guard let from = a.from, let to = a.to else { throw HelperError.badRequest("drag requires from/to") }
    let src = CGEventSource(stateID: .hidSystemState)
    let p1 = CGPoint(x: from.x, y: from.y)
    let p2 = CGPoint(x: to.x, y: to.y)
    let down = CGEvent(mouseEventSource: src, mouseType: .leftMouseDown, mouseCursorPosition: p1, mouseButton: .left)
    down?.post(tap: .cghidEventTap)
    let steps = 20
    for i in 1...steps {
      let t = Double(i) / Double(steps)
      let p = CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t)
      let mv = CGEvent(mouseEventSource: src, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left)
      mv?.post(tap: .cghidEventTap)
      Thread.sleep(forTimeInterval: 0.01)
    }
    let up = CGEvent(mouseEventSource: src, mouseType: .leftMouseUp, mouseCursorPosition: p2, mouseButton: .left)
    up?.post(tap: .cghidEventTap)
    settle()
    return ["action": "drag", "from": ["x": from.x, "y": from.y], "to": ["x": to.x, "y": to.y]]
  }

  // ---- wait ----
  private static func wait(_ a: ActionPayload) throws -> [String: Any] {
    let ms = min(max(a.ms ?? 0, 0), 10_000)
    Thread.sleep(forTimeInterval: Double(ms) / 1000.0)
    return ["action": "wait", "ms": ms]
  }

  // ---- ax_action ----
  private static func axAction(_ a: ActionPayload) throws -> [String: Any] {
    guard let ref = a.ref else { throw HelperError.badRequest("ax_action requires ref") }
    guard let name = a.action else { throw HelperError.badRequest("ax_action requires action name (e.g. AXPress)") }
    let el = try AXTree.resolve(ref: ref)
    let err = AXUIElementPerformAction(el, name as CFString)
    if err != .success {
      throw HelperError.runtime("AXUIElementPerformAction failed: \(err.rawValue)")
    }
    settle()
    return ["action": "ax_action", "name": name]
  }

  // ---- menu_click ----
  // Walks the target app's AXMenuBar and AXPresses the matching menu item
  // without synthesizing mouse/keyboard events. Cursor never moves. Works
  // even when the app's main window is custom-drawn (WeChat/QQ/Feishu)
  // because the menu bar is always AX-exposed by AppKit.
  private static func menuClick(_ a: ActionPayload) throws -> [String: Any] {
    guard let appName = a.app, !appName.isEmpty else {
      throw HelperError.badRequest("menu_click requires app (name or bundleId)")
    }
    guard let path = a.menuPath, !path.isEmpty else {
      throw HelperError.badRequest("menu_click requires menuPath (e.g. [\"View\",\"Moments\"])")
    }
    let apps = NSWorkspace.shared.runningApplications
    guard let app = apps.first(where: {
      $0.localizedName == appName || $0.bundleIdentifier == appName
    }) else {
      throw HelperError.runtime("App not running: \(appName)")
    }
    // Bring app forward — some menu commands only route to the frontmost app.
    app.activate(options: [])
    Thread.sleep(forTimeInterval: 0.08)

    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    var menuBarRef: CFTypeRef?
    let mbErr = AXUIElementCopyAttributeValue(axApp, kAXMenuBarAttribute as CFString, &menuBarRef)
    guard mbErr == .success, let cf = menuBarRef else {
      throw HelperError.runtime("App has no AXMenuBar: \(appName)")
    }
    let menuBar = cf as! AXUIElement

    // BFS over the menu tree, matching path segments by title. At each level
    // we consider the current element's AXChildren, and also descend into
    // AXMenu wrappers (AXMenuBarItem → AXMenu → AXMenuItem). Submenu items
    // typically need the parent opened to populate children; we try a cheap
    // AXPress of the parent on miss, then re-read children.
    var current: AXUIElement = menuBar
    for (i, segment) in path.enumerated() {
      guard let match = findMenuChild(current, title: segment) else {
        // Try expanding the parent (works for submenus whose children are
        // lazy-populated). Only meaningful past the menu bar level.
        if i > 0 {
          AXUIElementPerformAction(current, kAXPressAction as CFString)
          Thread.sleep(forTimeInterval: 0.05)
          if let retry = findMenuChild(current, title: segment) {
            current = retry
            continue
          }
        }
        throw HelperError.runtime("Menu item not found: \(path.prefix(i + 1).joined(separator: " > "))")
      }
      current = match
    }
    let err = AXUIElementPerformAction(current, kAXPressAction as CFString)
    if err != .success {
      throw HelperError.runtime("AXPress on menu item failed: \(err.rawValue)")
    }
    settle()
    return ["action": "menu_click", "app": appName, "menuPath": path]
  }

  // Recursively search for a child (or grandchild via AXMenu wrapper) whose
  // AXTitle matches `title`. Returns the matching menu item (AXMenuItem or
  // AXMenuBarItem), which is the element to AXPress.
  private static func findMenuChild(_ parent: AXUIElement, title: String) -> AXUIElement? {
    var childrenRef: CFTypeRef?
    AXUIElementCopyAttributeValue(parent, kAXChildrenAttribute as CFString, &childrenRef)
    guard let children = childrenRef as? [AXUIElement] else { return nil }
    for child in children {
      var titleRef: CFTypeRef?
      AXUIElementCopyAttributeValue(child, kAXTitleAttribute as CFString, &titleRef)
      let t = (titleRef as? String) ?? ""
      if t == title { return child }
      // Descend into AXMenu wrappers without recursing into sibling menus,
      // so "View > Moments" doesn't accidentally match "File > Export...".
      var roleRef: CFTypeRef?
      AXUIElementCopyAttributeValue(child, kAXRoleAttribute as CFString, &roleRef)
      if let r = roleRef as? String, r == "AXMenu" {
        if let hit = findMenuChild(child, title: title) { return hit }
      }
    }
    return nil
  }

  // ---- helpers ----
  private static func resolvePoint(ref: AxRefDTO?, point: PointDTO?) throws -> CGPoint {
    if let p = point { return CGPoint(x: p.x, y: p.y) }
    guard let ref = ref else { throw HelperError.badRequest("click requires ref or point") }
    let el = try AXTree.resolve(ref: ref)
    guard let c = AXTree.center(of: el) else {
      throw HelperError.runtime("Element has no frame — use ax_action AXPress instead")
    }
    return c
  }

  private static func settle() {
    Thread.sleep(forTimeInterval: 0.15)
  }
}
