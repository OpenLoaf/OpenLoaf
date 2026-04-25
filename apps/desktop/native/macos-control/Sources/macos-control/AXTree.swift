import Foundation
import ApplicationServices
import AppKit

// Dump a trimmed AX tree of the frontmost (or filtered) application.
// Each node: { role, subrole?, title?, value?, description?, identifier?, frame, path, actions, children }.
// `path` is the child-index chain from the app root — used to re-resolve the element later.
enum AXTree {
  static func dump(appFilter: String?, maxNodes: Int, maxDepth: Int) throws -> [String: Any] {
    let runningApp = try resolveTargetApp(filter: appFilter)
    let pid = runningApp.processIdentifier
    let axApp = AXUIElementCreateApplication(pid)

    var budget = Budget(nodes: maxNodes)
    let root = walk(axApp, depth: 0, maxDepth: maxDepth, path: [String](), budget: &budget)

    // axRichness = share of nodes the model could plausibly target (has
    // actions / identifier / title). Note this counts the whole tree including
    // the menu bar, so WeChat (≈3 chrome buttons in the window + rich menu
    // bar) still shows high richness. Whether the business UI is AX-reachable
    // vs self-drawn is a stronger judgement that needs window-tree structure
    // — the Survey tool makes that call. We emit only the raw number here.
    let richness: Double
    if budget.count > 0 {
      richness = Double(budget.actionableCount) / Double(budget.count)
    } else {
      richness = 0
    }

    // windowChildRoles: the direct children roles of the app's first AXWindow.
    // If it's nothing but chrome buttons (Close/Minimize/Zoom/FullScreen +
    // maybe AXToolbar), the real business UI is painted, not AX — the caller
    // should not try AX path clicks for navigation.
    let windowChildRoles = collectFirstWindowChildRoles(axApp)

    return [
      "app": [
        "name": runningApp.localizedName ?? "",
        "bundleId": runningApp.bundleIdentifier ?? "",
        "pid": Int(pid),
      ],
      "tree": root ?? NSNull(),
      "truncated": budget.truncated,
      "nodeCount": budget.count,
      "axRichness": richness,
      "windowChildRoles": windowChildRoles,
    ]
  }

  // Return the direct-child roles of the app's frontmost AXWindow, for
  // self-drawn-UI detection. e.g. WeChat → ["AXButton","AXButton","AXButton"]
  // with all three being chrome. Finder → many roles including AXOutline,
  // AXGroup, AXScrollArea, AXToolbar etc. Empty array when no window is
  // reachable (app not fully launched, all windows minimized).
  private static func collectFirstWindowChildRoles(_ axApp: AXUIElement) -> [String] {
    guard let appChildren = axChildren(axApp) else { return [] }
    for child in appChildren {
      guard let role = axString(child, kAXRoleAttribute), role == "AXWindow" else { continue }
      guard let winChildren = axChildren(child) else { return [] }
      return winChildren.compactMap { el -> String? in
        let r = axString(el, kAXRoleAttribute) ?? ""
        let sub = axString(el, kAXSubroleAttribute) ?? ""
        // Use subrole when present (AXCloseButton is more informative than
        // AXButton); otherwise fall back to role.
        return sub.isEmpty ? r : sub
      }
    }
    return []
  }

  private static func resolveTargetApp(filter: String?) throws -> NSRunningApplication {
    let apps = NSWorkspace.shared.runningApplications
    if let f = filter, !f.isEmpty {
      if let hit = apps.first(where: { app in
        (app.localizedName?.caseInsensitiveCompare(f) == .orderedSame)
          || (app.bundleIdentifier?.caseInsensitiveCompare(f) == .orderedSame)
      }) { return hit }
      throw HelperError.badRequest("App not running: \(f)")
    }
    if let front = NSWorkspace.shared.frontmostApplication { return front }
    throw HelperError.runtime("No frontmost application")
  }

  private struct Budget {
    var nodes: Int
    var count: Int = 0
    var truncated: Bool = false
    // Counts nodes the model can "grab" — has actions, identifier, or
    // non-empty title. Divide by `count` for an AX richness ratio used to
    // tell the model "this app's AX tree is a chrome-only shell, don't try
    // to AXPress by path — go menu_click or coord click instead".
    var actionableCount: Int = 0
    mutating func take() -> Bool {
      if count >= nodes { truncated = true; return false }
      count += 1
      return true
    }
    mutating func creditActionable() {
      actionableCount += 1
    }
  }

  private static func walk(_ el: AXUIElement, depth: Int, maxDepth: Int,
                           path: [String], budget: inout Budget) -> [String: Any]? {
    guard budget.take() else { return nil }

    var node: [String: Any] = [:]
    node["path"] = path
    let role = axString(el, kAXRoleAttribute)
    if let s = role { node["role"] = s }
    if let s = axString(el, kAXSubroleAttribute) { node["subrole"] = s }
    let titleValue = axString(el, kAXTitleAttribute)
    if let s = titleValue, !s.isEmpty { node["title"] = s }
    if let s = axString(el, kAXValueAttribute), !s.isEmpty { node["value"] = s }
    if let s = axString(el, kAXDescriptionAttribute), !s.isEmpty { node["description"] = s }
    let identifierValue = axString(el, kAXIdentifierAttribute)
    if let s = identifierValue, !s.isEmpty { node["identifier"] = s }
    if let frame = axFrame(el) { node["frame"] = frame }
    let actionsValue = axActions(el)
    if let actions = actionsValue, !actions.isEmpty { node["actions"] = actions }

    // Credit this node as "actionable" if the model could plausibly target it:
    // has AX actions, a stable identifier, or a non-empty title. Pure
    // containers (AXGroup / AXSplitGroup with no id / no title) don't count.
    // The ratio becomes axRichness, used to decide whether AX path clicks
    // make sense at all.
    let hasActions = (actionsValue?.isEmpty == false)
    let hasIdentifier = (identifierValue?.isEmpty == false)
    let hasTitle = (titleValue?.isEmpty == false)
    if hasActions || hasIdentifier || hasTitle {
      budget.creditActionable()
    }

    // For menu items, surface the keyboard shortcut so the model doesn't need
    // to OCR menus or guess. Adapted from Peekaboo MenuService+List.swift
    // extractKeyboardShortcut (MIT). Phase 1 reads CmdChar + CmdModifiers only
    // — covers ~90% of real shortcuts. AXMenuItemCmdVirtualKey (arrows / Fn
    // keys) and AXMenuItemCmdGlyph (special glyphs) left for later.
    if role == "AXMenuItem", let cmdChar = axString(el, "AXMenuItemCmdChar"), !cmdChar.isEmpty {
      let mods = axInt(el, "AXMenuItemCmdModifiers") ?? 0
      node["shortcut"] = formatShortcut(cmdChar: cmdChar, modifiers: mods)
    }

    if depth >= maxDepth {
      return node
    }
    if let children = axChildren(el) {
      var kids: [[String: Any]] = []
      for (i, child) in children.enumerated() {
        if let k = walk(child, depth: depth + 1, maxDepth: maxDepth, path: path + [String(i)], budget: &budget) {
          kids.append(k)
        }
        if budget.count >= budget.nodes { break }
      }
      if !kids.isEmpty { node["children"] = kids }
    }
    return node
  }

  // Resolve an AxRef back to an AXUIElement for act-time targeting.
  static func resolve(ref: AxRefDTO) throws -> AXUIElement {
    switch ref {
    case .path(let app, let idxs):
      let runningApp = try resolveTargetApp(filter: app)
      var el = AXUIElementCreateApplication(runningApp.processIdentifier)
      for i in idxs.compactMap({ Int($0) }) {
        guard let kids = axChildren(el), i < kids.count else {
          throw HelperError.runtime("AxRef path out of range at index \(i)")
        }
        el = kids[i]
      }
      return el
    case .identifier(let id):
      guard let front = NSWorkspace.shared.frontmostApplication else {
        throw HelperError.runtime("No frontmost app for identifier lookup")
      }
      let axApp = AXUIElementCreateApplication(front.processIdentifier)
      if let hit = findByIdentifier(axApp, id: id, budget: 3000) {
        return hit
      }
      throw HelperError.runtime("Identifier not found: \(id)")
    }
  }

  private static func findByIdentifier(_ el: AXUIElement, id: String, budget: Int) -> AXUIElement? {
    var budget = budget
    return search(el, &budget)
    func search(_ el: AXUIElement, _ budget: inout Int) -> AXUIElement? {
      if budget <= 0 { return nil }
      budget -= 1
      if let s = axString(el, kAXIdentifierAttribute), s == id { return el }
      if let kids = axChildren(el) {
        for c in kids {
          if let hit = search(c, &budget) { return hit }
        }
      }
      return nil
    }
  }

  // ---- AX attribute helpers ----
  private static func axString(_ el: AXUIElement, _ attr: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, attr as CFString, &value) == .success else { return nil }
    return value as? String
  }

  private static func axInt(_ el: AXUIElement, _ attr: String) -> Int? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, attr as CFString, &value) == .success else { return nil }
    return value as? Int
  }

  // Format an AXMenuItem shortcut into a readable "⌃⌥⇧⌘C" string.
  // Bit layout follows Apple's official kAXMenuItemModifier* constants:
  //   bit 0 = ⇧ shift
  //   bit 1 = ⌥ option
  //   bit 2 = ⌃ control
  //   bit 3 = kAXMenuItemModifierNoCommand — inverted: 1 means "no ⌘"
  //     (so modifiers == 0 is the most common "⌘+char" case, e.g. ⌘N).
  // Order follows macOS convention ⌃⌥⇧⌘key. Virtual keys / Cmd glyphs for
  // arrows and Fn keys are Phase 2.
  private static func formatShortcut(cmdChar: String, modifiers: Int) -> String {
    var parts: [String] = []
    if modifiers & (1 << 2) != 0 { parts.append("⌃") }
    if modifiers & (1 << 1) != 0 { parts.append("⌥") }
    if modifiers & (1 << 0) != 0 { parts.append("⇧") }
    if modifiers & (1 << 3) == 0 { parts.append("⌘") }
    parts.append(cmdChar.uppercased())
    return parts.joined()
  }

  private static func axChildren(_ el: AXUIElement) -> [AXUIElement]? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &value) == .success else { return nil }
    return value as? [AXUIElement]
  }

  private static func axActions(_ el: AXUIElement) -> [String]? {
    var actions: CFArray?
    guard AXUIElementCopyActionNames(el, &actions) == .success else { return nil }
    return actions as? [String]
  }

  private static func axFrame(_ el: AXUIElement) -> [String: Double]? {
    var posRef: CFTypeRef?
    var sizeRef: CFTypeRef?
    guard
      AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &posRef) == .success,
      AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &sizeRef) == .success
    else { return nil }
    var p = CGPoint.zero
    var s = CGSize.zero
    AXValueGetValue(posRef as! AXValue, .cgPoint, &p)
    AXValueGetValue(sizeRef as! AXValue, .cgSize, &s)
    return ["x": p.x, "y": p.y, "w": s.width, "h": s.height]
  }

  // Geometric center of an element (screen coords) — used to click when AX refuses AXPress.
  static func center(of el: AXUIElement) -> CGPoint? {
    var posRef: CFTypeRef?
    var sizeRef: CFTypeRef?
    guard
      AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &posRef) == .success,
      AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &sizeRef) == .success
    else { return nil }
    var p = CGPoint.zero
    var s = CGSize.zero
    AXValueGetValue(posRef as! AXValue, .cgPoint, &p)
    AXValueGetValue(sizeRef as! AXValue, .cgSize, &s)
    return CGPoint(x: p.x + s.width / 2, y: p.y + s.height / 2)
  }
}
