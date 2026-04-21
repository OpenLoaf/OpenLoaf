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
    let root = walk(axApp, depth: 0, maxDepth: maxDepth, path: [], budget: &budget)

    return [
      "app": [
        "name": runningApp.localizedName ?? "",
        "bundleId": runningApp.bundleIdentifier ?? "",
        "pid": Int(pid),
      ],
      "tree": root ?? NSNull(),
      "truncated": budget.truncated,
      "nodeCount": budget.count,
    ]
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
    mutating func take() -> Bool {
      if count >= nodes { truncated = true; return false }
      count += 1
      return true
    }
  }

  private static func walk(_ el: AXUIElement, depth: Int, maxDepth: Int,
                           path: [Int], budget: inout Budget) -> [String: Any]? {
    guard budget.take() else { return nil }

    var node: [String: Any] = [:]
    node["path"] = path
    if let s = axString(el, kAXRoleAttribute) { node["role"] = s }
    if let s = axString(el, kAXSubroleAttribute) { node["subrole"] = s }
    if let s = axString(el, kAXTitleAttribute), !s.isEmpty { node["title"] = s }
    if let s = axString(el, kAXValueAttribute), !s.isEmpty { node["value"] = s }
    if let s = axString(el, kAXDescriptionAttribute), !s.isEmpty { node["description"] = s }
    if let s = axString(el, kAXIdentifierAttribute), !s.isEmpty { node["identifier"] = s }
    if let frame = axFrame(el) { node["frame"] = frame }
    if let actions = axActions(el), !actions.isEmpty { node["actions"] = actions }

    if depth >= maxDepth {
      return node
    }
    if let children = axChildren(el) {
      var kids: [[String: Any]] = []
      for (i, child) in children.enumerated() {
        if let k = walk(child, depth: depth + 1, maxDepth: maxDepth, path: path + [i], budget: &budget) {
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
