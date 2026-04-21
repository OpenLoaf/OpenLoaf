// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "macos-control",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(
      name: "macos-control",
      path: "Sources/macos-control"
    )
  ]
)
