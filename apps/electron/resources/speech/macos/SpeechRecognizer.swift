import AVFoundation
import Foundation
import Speech

/// Payload for speech recognition events.
struct SpeechEvent: Encodable {
  /// Event type name.
  let type: String
  /// Recognized text content.
  let text: String?
  /// Error message for failed recognition.
  let message: String?
  /// Error detail for failed recognition.
  let detail: String?
  /// Locale identifier for the recognition session.
  let lang: String?
}

final class SpeechRecognizerRunner {
  /// Locale identifier used for recognition.
  private let language: String?
  /// Output stream for JSON lines.
  private let output = FileHandle.standardOutput
  /// Audio engine that captures microphone input.
  private let audioEngine = AVAudioEngine()
  /// Active speech recognition request.
  private var request: SFSpeechAudioBufferRecognitionRequest?
  /// Active speech recognition task.
  private var task: SFSpeechRecognitionTask?

  /// Create a speech recognizer runner for the given language.
  init(language: String?) {
    self.language = language
  }

  /// Start speech recognition after permission checks.
  func start() {
    requestPermissions { [weak self] authorized, errorMessage in
      guard let self else { return }
      guard authorized else {
        self.sendError(message: errorMessage ?? "Speech authorization failed")
        return
      }
      self.startRecognition()
    }
  }

  /// Stop speech recognition and release audio resources.
  func stop() {
    task?.cancel()
    task = nil
    request?.endAudio()
    request = nil
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
  }

  /// Request speech and microphone permissions.
  private func requestPermissions(completion: @escaping (Bool, String?) -> Void) {
    SFSpeechRecognizer.requestAuthorization { status in
      guard status == .authorized else {
        completion(false, "Speech recognition not authorized")
        return
      }
      AVCaptureDevice.requestAccess(for: .audio) { granted in
        completion(granted, granted ? nil : "Microphone access denied")
      }
    }
  }

  /// Start the speech recognition task and stream results.
  private func startRecognition() {
    guard let recognizer = buildRecognizer() else {
      sendError(message: "Speech recognizer unavailable")
      return
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    // 中文注释：macOS 13 起支持自动标点。
    if #available(macOS 13.0, *) {
      request.addsPunctuation = true
    }
    self.request = request

    let inputNode = audioEngine.inputNode
    let recordingFormat = inputNode.outputFormat(forBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
      request.append(buffer)
    }

    audioEngine.prepare()
    do {
      try audioEngine.start()
    } catch {
      sendError(message: "Audio engine start failed", detail: String(describing: error))
      return
    }

    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      if let result {
        let text = result.bestTranscription.formattedString
        let type = result.isFinal ? "final" : "partial"
        self.sendEvent(type: type, text: text)
      }
      if let error {
        self.sendError(message: "Speech recognition error", detail: String(describing: error))
        self.stop()
      }
    }
  }

  /// Build a speech recognizer for the specified language.
  private func buildRecognizer() -> SFSpeechRecognizer? {
    if let language, !language.isEmpty {
      return SFSpeechRecognizer(locale: Locale(identifier: language))
    }
    return SFSpeechRecognizer()
  }

  /// Emit a speech event as a JSON line.
  private func sendEvent(type: String, text: String? = nil, message: String? = nil, detail: String? = nil) {
    let payload = SpeechEvent(type: type, text: text, message: message, detail: detail, lang: language)
    guard let data = try? JSONEncoder().encode(payload) else { return }
    guard let line = String(data: data, encoding: .utf8) else { return }
    guard let outputData = (line + "\n").data(using: .utf8) else { return }
    output.write(outputData)
  }

  /// Emit a speech error as a JSON line.
  private func sendError(message: String, detail: String? = nil) {
    sendEvent(type: "error", message: message, detail: detail)
  }
}

/// Parse language from CLI arguments.
private func parseLanguage() -> String? {
  let args = CommandLine.arguments
  if let index = args.firstIndex(of: "--lang"), index + 1 < args.count {
    return args[index + 1]
  }
  return args.count > 1 ? args[1] : nil
}

/// Shared runner instance for signal handlers.
private var runner: SpeechRecognizerRunner?

/// Handle termination signals to stop recognition cleanly.
private func handleSignal(_ signal: Int32) {
  runner?.stop()
  exit(signal)
}

signal(SIGTERM, handleSignal)
signal(SIGINT, handleSignal)

runner = SpeechRecognizerRunner(language: parseLanguage())
runner?.start()

dispatchMain()
