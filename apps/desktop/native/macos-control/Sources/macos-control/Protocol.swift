import Foundation

// Line-delimited JSON protocol between Node (OpenLoaf server) and this helper.
// Every request has { id, op, ... }. Every response has { id, ok, ... }.

struct Envelope: Decodable {
  let id: String
  let op: String
}

struct ObserveRequest: Decodable {
  let id: String
  let op: String
  let screenshotPath: String?
  let appFilter: String?
  let maxNodes: Int?
  let maxDepth: Int?
  let includeScreenshot: Bool?
  // When true, observe returns a `windows` array alongside the AX tree so the
  // model can see all renderable windows for the target app and request per-
  // window captures via `capture_window` without re-observing. Defaults to
  // true so existing callers get the extra context for free.
  let includeWindows: Bool?
}

struct ListWindowsRequest: Decodable {
  let id: String
  let op: String
  let appFilter: String?
}

struct CaptureWindowRequest: Decodable {
  let id: String
  let op: String
  let windowID: UInt32
  let screenshotPath: String?
}

struct PointDTO: Codable {
  let x: Double
  let y: Double
}

enum AxRefDTO: Codable {
  case path(app: String, path: [String])
  case identifier(String)

  private enum Keys: String, CodingKey { case app, path, identifier }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: Keys.self)
    if let id = try? c.decode(String.self, forKey: .identifier) {
      self = .identifier(id); return
    }
    let app = try c.decode(String.self, forKey: .app)
    let path = try c.decode([String].self, forKey: .path)
    self = .path(app: app, path: path)
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Keys.self)
    switch self {
    case .identifier(let id):
      try c.encode(id, forKey: .identifier)
    case .path(let app, let path):
      try c.encode(app, forKey: .app)
      try c.encode(path, forKey: .path)
    }
  }
}

struct ActionPayload: Decodable {
  let type: String
  let ref: AxRefDTO?
  let point: PointDTO?
  let button: String?
  let clicks: Int?
  let text: String?
  let keys: [String]?
  let dy: Double?
  let dx: Double?
  let from: PointDTO?
  let to: PointDTO?
  let ms: Int?
  let action: String?
  // menu_click
  let app: String?
  let menuPath: [String]?
  // Escape hatch for destructive click preflight (WINDOW_CHROME_BLOCKED):
  // when true, we skip the chrome-button safety check and dispatch the click
  // anyway. Must be set explicitly per action — there is no global bypass.
  let confirmWindowChrome: Bool?
}

struct ActRequest: Decodable {
  let id: String
  let op: String
  let action: ActionPayload
}

// Response envelope — built as raw JSON dict so we can stream heterogeneous payloads.
struct Response {
  let id: String
  var ok: Bool
  var payload: [String: Any] = [:]

  func serialize() throws -> Data {
    var dict: [String: Any] = ["id": id, "ok": ok]
    for (k, v) in payload { dict[k] = v }
    return try JSONSerialization.data(withJSONObject: dict, options: [])
  }
}

enum HelperError: Error {
  case badRequest(String)
  case runtime(String)
  case permissionMissing([String])
  // Structured refusal: tool-layer safety rule rejected the action before it
  // touched the system. `code` is a machine-readable tag (e.g.
  // "WINDOW_CHROME_BLOCKED") the TS layer can map to model guidance; `message`
  // is free-form context for logs.
  case blocked(code: String, message: String)
}
