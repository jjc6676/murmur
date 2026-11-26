import MurmurCore
import SwiftUI

struct SettingsView: View {
    @ObservedObject var session: DictationSession
    let setup: () -> Void
    @AppStorage("history_enabled", store: Paper.preferences) private var historyEnabled = true
    @AppStorage("session_minutes", store: Paper.preferences) private var minutes = 10
    @AppStorage("haptics", store: Paper.preferences) private var haptics = true
    @State private var confirmDelete = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                PageHeading(title: "Settings", subtitle: "Choose how Murmur works on this iPhone.")
                    .listRowInsets(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0)).listRowBackground(Color.clear)
                Section {
                    Picker("Session length", selection: $minutes) {
                        ForEach([1, 5, 10, 15, 30, 60], id: \.self) { value in Text("\(value) min").tag(value) }
                    }
                    Toggle("Keyboard haptics", isOn: $haptics)
                    if session.state.sessionActive || session.preparing {
                        Button("Stop current session", role: .destructive) { session.stop() }
                    }
                } header: { Text("Keyboard") } footer: {
                    Text("The microphone turns off when the session expires. Each dictation extends the session.")
                }
                Section {
                    Toggle("Save dictation history", isOn: $historyEnabled)
                    Button("Delete all history", role: .destructive) { confirmDelete = true }
                } header: { Text("Privacy") } footer: {
                    Text("Turning history off hides saved entries and stops saving new ones. Delete all history to permanently remove earlier dictations and their statistics.")
                }
                Section("Speech model") {
                    LabeledContent("Model", value: "Whisper base.en")
                    LabeledContent("Language", value: "English")
                    Label("Bundled with Murmur · runs offline", systemImage: "iphone")
                }
                Section("About") {
                    LabeledContent("Murmur", value: version)
                    Button("Review keyboard setup", action: setup)
                }
            }
            .scrollContentBackground(.hidden).background(Paper.background)
            .navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
            .onChange(of: minutes) { _, _ in session.renewIfActive() }
            .confirmationDialog("Permanently delete every saved dictation?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete all history", role: .destructive) {
                    do { try session.store.deleteAll(); session.historyDidChange() }
                    catch { issue = error.localizedDescription }
                }
                Button("Cancel", role: .cancel) {}
            } message: { Text("This cannot be undone. Your dictionary and snippets will be kept.") }
            .errorAlert($issue)
        }
    }

    private var version: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? "—"
        return "\(version) (\(build))"
    }
}
