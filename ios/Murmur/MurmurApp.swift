import AVFoundation
import MurmurCore
import SwiftUI
import UIKit

@main
struct MurmurApp: App {
    private let database = Result { try MurmurStore() }

    var body: some Scene {
        WindowGroup {
            switch database {
            case .success(let store): MurmurRoot(store: store)
            case .failure(let error):
                ContentUnavailableView {
                    Label("Murmur couldn’t open its library", systemImage: "externaldrive.badge.exclamationmark")
                } description: {
                    Text("\(error.localizedDescription)\n\nCheck that the app and keyboard are signed with the same Murmur App Group.")
                }
            }
        }
    }
}

enum Paper {
    static let background = Color(red: 245 / 255, green: 244 / 255, blue: 240 / 255)
    static let green = Color(red: 0.13, green: 0.32, blue: 0.25)
    static let lavender = Color(red: 235 / 255, green: 221 / 255, blue: 251 / 255)
    static let preferences = UserDefaults(suiteName: MurmurIPC.appGroup)
}

struct MurmurMark: View {
    private static let heights: [CGFloat] = [10, 19, 28, 22, 13]
    var body: some View {
        HStack(spacing: 3) {
            ForEach(Self.heights.indices, id: \.self) { index in
                Capsule().frame(width: 4, height: Self.heights[index])
            }
        }
        .foregroundStyle(Paper.green).accessibilityHidden(true)
    }
}

struct PrimaryAction: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline).multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 50).padding(.horizontal, 12)
            .background(Paper.green.opacity(configuration.isPressed ? 0.8 : 1), in: Capsule())
            .foregroundStyle(.white)
    }
}

struct PageHeading: View {
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(.largeTitle, design: .serif, weight: .semibold)).accessibilityAddTraits(.isHeader)
            Text(subtitle).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

@MainActor
private struct MurmurRoot: View {
    @StateObject private var session: DictationSession
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("setup_step") private var step = 0
    @AppStorage("setup_deferred") private var deferred = false
    @State private var showingSession = false

    init(store: MurmurStore) { _session = StateObject(wrappedValue: DictationSession(store: store)) }

    var body: some View {
        Group {
            if showingSession {
                SessionView(session: session) { showingSession = false }
            } else if step < 5 && !deferred {
                OnboardingView(step: $step, session: session) { deferred = true }
            } else {
                TabView {
                    HomeView(session: session, resumeSetup: step < 5 ? { deferred = false } : nil) {
                        showingSession = true
                        session.start()
                    }.tabItem { Label("Home", systemImage: "house") }
                    RulesView(store: session.store, kind: .dictionary)
                        .tabItem { Label("Dictionary", systemImage: "book") }
                    RulesView(store: session.store, kind: .snippets)
                        .tabItem { Label("Snippets", systemImage: "text.quote") }
                    SettingsView(session: session) { step = 0; deferred = false }
                        .tabItem { Label("Settings", systemImage: "gearshape") }
                }
            }
        }
        .tint(Paper.green)
        .preferredColorScheme(.light)
        .onOpenURL { url in
            guard url.scheme?.lowercased() == "murmur", url.host?.lowercased() == "session", url.path == "/start" else { return }
            showingSession = true
            session.start()
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { session.checkDeadline() } }
    }
}

private struct SessionView: View {
    @ObservedObject var session: DictationSession
    let close: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Label("Keyboard session", systemImage: "keyboard").font(.subheadline.weight(.medium))
                MurmurMark().padding(24).background(Paper.lavender, in: Circle())
                PageHeading(title: session.preparing ? "Getting ready…" : session.state.sessionActive ? "Session active" : "Session off",
                            subtitle: session.state.sessionActive ? "Swipe back to your app. Tap the mic on the Murmur keyboard to dictate." : session.state.message ?? "Start a session to use the Murmur keyboard.")
                if session.preparing { ProgressView().accessibilityLabel("Preparing session") }
                if session.state.sessionActive {
                    if let date = session.state.sessionExpiresAt {
                        Text("Available until \(date.formatted(date: .omitted, time: .shortened)) unless you dictate again.")
                    }
                    Text("The microphone stays active during this session. Murmur only keeps audio between tapping record and finish, and discards it after transcription.")
                        .font(.callout).foregroundStyle(.secondary)
                }
                if !session.state.sessionActive && !session.preparing {
                    if AVAudioApplication.shared.recordPermission == .denied {
                        Button("Open Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
                            .buttonStyle(PrimaryAction())
                    } else {
                        Button("Start session") { session.start() }.buttonStyle(PrimaryAction())
                    }
                } else {
                    Button(session.preparing ? "Cancel" : "Stop session") { session.stop() }.buttonStyle(PrimaryAction())
                }
                Button("Return to Murmur", action: close).frame(maxWidth: .infinity, minHeight: 44)
            }.padding(24)
        }.background(Paper.background.ignoresSafeArea())
    }
}
