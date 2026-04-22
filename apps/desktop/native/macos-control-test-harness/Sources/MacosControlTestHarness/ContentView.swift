import SwiftUI

enum Scenario: String, CaseIterable, Identifiable {
  case basic
  case form
  case scrollList
  case focus
  case menu

  var id: String { rawValue }

  var title: String {
    switch self {
    case .basic:      return "Basic"
    case .form:       return "Form"
    case .scrollList: return "Scroll"
    case .focus:      return "Focus"
    case .menu:       return "Menu"
    }
  }
}

struct ContentView: View {
  @State private var scenario: Scenario = .basic

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 6) {
        ForEach(Scenario.allCases) { s in
          Button(s.title) { scenario = s }
            .buttonStyle(.bordered)
            .tint(scenario == s ? .accentColor : .secondary)
            .accessibilityIdentifier("tab-\(s.rawValue)")
        }
        Spacer()
      }
      .padding(12)

      Divider()

      Group {
        switch scenario {
        case .basic:      BasicScene()
        case .form:       FormScene()
        case .scrollList: ScrollScene()
        case .focus:      FocusScene()
        case .menu:       MenuScene()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

// MARK: - Basic

struct BasicScene: View {
  @State private var count = 0

  var body: some View {
    VStack(spacing: 16) {
      Text("Counter: \(count)")
        .font(.title2)
        .accessibilityIdentifier("lbl-count")

      HStack(spacing: 12) {
        Button("Increment") { count += 1 }
          .accessibilityIdentifier("btn-increment")

        Button("Decrement") { count -= 1 }
          .accessibilityIdentifier("btn-decrement")

        Button("Reset") { count = 0 }
          .accessibilityIdentifier("btn-reset")
      }
    }
    .padding()
  }
}

// MARK: - Form

struct FormScene: View {
  @State private var name = ""
  @State private var email = ""
  @State private var submitted: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Name")
      TextField("Enter name", text: $name)
        .textFieldStyle(.roundedBorder)
        .accessibilityIdentifier("input-name")

      Text("Email")
      TextField("Enter email", text: $email)
        .textFieldStyle(.roundedBorder)
        .accessibilityIdentifier("input-email")

      HStack {
        Button("Submit") {
          submitted = "Submitted: \(name) <\(email)>"
        }
        .accessibilityIdentifier("btn-submit")

        Button("Clear") {
          name = ""
          email = ""
          submitted = nil
        }
        .accessibilityIdentifier("btn-clear")
      }

      if let s = submitted {
        Text(s)
          .foregroundColor(.green)
          .accessibilityIdentifier("lbl-submitted")
      } else {
        Text("")
          .accessibilityIdentifier("lbl-submitted")
      }

      Spacer()
    }
    .padding()
  }
}

// MARK: - Scroll

struct ScrollScene: View {
  @State private var selected: Int? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(selected.map { "Selected row: \($0)" } ?? "No row selected")
        .accessibilityIdentifier("lbl-selected-row")

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 4) {
          ForEach(0..<100, id: \.self) { i in
            Button {
              selected = i
            } label: {
              HStack {
                Text("Row \(i)")
                Spacer()
                if selected == i { Image(systemName: "checkmark") }
              }
              .padding(.vertical, 6)
              .padding(.horizontal, 12)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(selected == i ? Color.accentColor.opacity(0.2) : Color.clear)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("row-\(i)")
          }
        }
      }
      .accessibilityIdentifier("scroll-list")
    }
    .padding()
  }
}

// MARK: - Focus

struct FocusScene: View {
  @State private var a = ""
  @State private var b = ""
  @State private var c = ""
  @FocusState private var focused: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Focused: \(focused ?? "none")")
        .accessibilityIdentifier("lbl-focused")

      TextField("Field A", text: $a)
        .textFieldStyle(.roundedBorder)
        .focused($focused, equals: "a")
        .accessibilityIdentifier("input-a")

      TextField("Field B", text: $b)
        .textFieldStyle(.roundedBorder)
        .focused($focused, equals: "b")
        .accessibilityIdentifier("input-b")

      TextField("Field C", text: $c)
        .textFieldStyle(.roundedBorder)
        .focused($focused, equals: "c")
        .accessibilityIdentifier("input-c")

      Spacer()
    }
    .padding()
  }
}

// MARK: - Menu

struct MenuScene: View {
  @State private var lastAction = ""
  @State private var popoverOpen = false

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Last action: \(lastAction.isEmpty ? "—" : lastAction)")
        .accessibilityIdentifier("lbl-last-action")

      Menu("Options") {
        Button("Option Alpha") { lastAction = "alpha" }
          .accessibilityIdentifier("menu-alpha")
        Button("Option Beta") { lastAction = "beta" }
          .accessibilityIdentifier("menu-beta")
        Button("Option Gamma") { lastAction = "gamma" }
          .accessibilityIdentifier("menu-gamma")
      }
      .accessibilityIdentifier("btn-options-menu")

      Button("Show Popover") { popoverOpen.toggle() }
        .accessibilityIdentifier("btn-popover")
        .popover(isPresented: $popoverOpen) {
          VStack(alignment: .leading, spacing: 8) {
            Text("Popover content")
              .accessibilityIdentifier("lbl-popover-title")
            Button("Close") { popoverOpen = false }
              .accessibilityIdentifier("btn-popover-close")
          }
          .padding()
          .frame(width: 200)
        }

      Spacer()
    }
    .padding()
  }
}
