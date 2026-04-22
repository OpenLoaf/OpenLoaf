// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "MacosControlTestHarness",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(
      name: "MacosControlTestHarness",
      path: "Sources/MacosControlTestHarness"
    )
  ]
)
