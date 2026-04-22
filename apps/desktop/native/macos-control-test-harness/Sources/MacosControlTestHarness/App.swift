import SwiftUI

@main
struct MacosControlTestHarnessApp: App {
  var body: some Scene {
    WindowGroup("macOS Control Test Harness") {
      ContentView()
        .frame(minWidth: 720, minHeight: 520)
    }
    .windowResizability(.contentMinSize)
  }
}
