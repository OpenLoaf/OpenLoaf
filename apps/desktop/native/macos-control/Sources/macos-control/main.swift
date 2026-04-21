import Foundation

// Line-delimited JSON request/response over stdio.
// Every request is one JSON object on one line; response is one JSON object on one line.
// Ops:
//   observe → { tree, screenshotPath?, nodeCount, truncated, permissionsMissing[] }
//   act     → { action, ...opSpecific, permissionsMissing[] }
//   permissions → { missing:[...] }
//   ping    → { pong:true }

let stdout = FileHandle.standardOutput
let stderr = FileHandle.standardError
let stdin = FileHandle.standardInput

func writeLine(_ data: Data) {
  stdout.write(data)
  stdout.write("\n".data(using: .utf8)!)
}

func sendOk(id: String, payload: [String: Any]) {
  let r = Response(id: id, ok: true, payload: payload)
  do {
    let d = try r.serialize()
    writeLine(d)
  } catch {
    stderr.write("serialize error: \(error)\n".data(using: .utf8)!)
  }
}

func sendErr(id: String, message: String, missing: [String] = []) {
  var payload: [String: Any] = ["error": message]
  if !missing.isEmpty { payload["permissionsMissing"] = missing }
  let r = Response(id: id, ok: false, payload: payload)
  do {
    writeLine(try r.serialize())
  } catch {
    stderr.write("serialize error: \(error)\n".data(using: .utf8)!)
  }
}

func dispatch(_ line: Data) {
  let decoder = JSONDecoder()
  // Peek envelope.
  guard let env = try? decoder.decode(Envelope.self, from: line) else {
    sendErr(id: "?", message: "Invalid request envelope")
    return
  }

  // Permission preflight for any op that needs system access.
  if env.op == "observe" || env.op == "act" {
    let missing = Permissions.missing()
    if !missing.isEmpty {
      // Trigger the TCC prompt so the user at least sees the system dialog once.
      Permissions.ensurePrompt()
      sendErr(id: env.id, message: "Missing permissions: \(missing.joined(separator: ","))",
              missing: missing)
      return
    }
  }

  do {
    switch env.op {
    case "ping":
      sendOk(id: env.id, payload: ["pong": true])

    case "permissions":
      sendOk(id: env.id, payload: ["missing": Permissions.missing()])

    case "observe":
      let req = try decoder.decode(ObserveRequest.self, from: line)
      var payload: [String: Any] = [:]

      if req.includeScreenshot ?? true {
        let path = req.screenshotPath ?? NSTemporaryDirectory() + "macos-control-\(req.id).png"
        let (w, h) = try Screenshot.captureMainDisplayPNG(to: path)
        payload["screenshotPath"] = path
        payload["screenshotWidth"] = w
        payload["screenshotHeight"] = h
      }

      let maxNodes = req.maxNodes ?? 1500
      let maxDepth = req.maxDepth ?? 6
      let tree = try AXTree.dump(appFilter: req.appFilter, maxNodes: maxNodes, maxDepth: maxDepth)
      payload["tree"] = tree["tree"]!
      payload["app"] = tree["app"]!
      payload["truncated"] = tree["truncated"]!
      payload["nodeCount"] = tree["nodeCount"]!
      sendOk(id: env.id, payload: payload)

    case "act":
      let req = try decoder.decode(ActRequest.self, from: line)
      let result = try Actions.execute(req.action)
      sendOk(id: env.id, payload: result)

    default:
      sendErr(id: env.id, message: "Unknown op: \(env.op)")
    }
  } catch let err as HelperError {
    switch err {
    case .badRequest(let m):
      sendErr(id: env.id, message: "bad_request: \(m)")
    case .runtime(let m):
      sendErr(id: env.id, message: "runtime: \(m)")
    case .permissionMissing(let list):
      sendErr(id: env.id, message: "permission_missing", missing: list)
    }
  } catch {
    sendErr(id: env.id, message: "error: \(error)")
  }
}

// Line-framed read loop.
var buffer = Data()
while true {
  let chunk = stdin.availableData
  if chunk.isEmpty { break }
  buffer.append(chunk)
  while let nlIdx = buffer.firstIndex(of: 0x0A) {
    let line = buffer.subdata(in: 0..<nlIdx)
    buffer.removeSubrange(0...nlIdx)
    if line.isEmpty { continue }
    dispatch(line)
  }
}
