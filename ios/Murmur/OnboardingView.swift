import AVFoundation
import SwiftUI
import UIKit

struct OnboardingView: View {
    @Binding var step: Int
    @ObservedObject var session: DictationSession
    let finishLater: () -> Void
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var permission = AVAudioApplication.shared.recordPermission
    @State private var requesting = false
    @State private var trial = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 12) {
                    MurmurMark()
                    Text("Murmur").font(.system(.title2, design: .serif, weight: .bold))
                    Spacer()
                    Text("\(step + 1) of 5").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                }
                ProgressView(value: Double(step + 1), total: 5).accessibilityLabel("Setup progress")
                switch step {
                case 0:
                    PageHeading(title: "Your words, without the cloud.", subtitle: "Speak wherever you type. Murmur turns your voice into text right here on your iPhone, even in airplane mode.")
                case 1:
                    PageHeading(title: "Let Murmur hear you.", subtitle: "The keyboard can’t use a microphone itself. Murmur runs a timed audio session for it. Audio is never uploaded or saved to your history.")
                    if permission == .granted {
                        Label("Microphone access allowed", systemImage: "checkmark.circle.fill")
                    } else if permission == .denied {
                        Text("Microphone access is off. Open Settings and enable Microphone for Murmur.")
                        settingsButton
                    } else {
                        Button(requesting ? "Requesting access…" : "Allow microphone") {
                            requesting = true
                            Task {
                                _ = await DictationSession.microphonePermission()
                                permission = AVAudioApplication.shared.recordPermission
                                requesting = false
                            }
                        }.buttonStyle(.bordered).disabled(requesting)
                    }
                case 2:
                    PageHeading(title: "Add the keyboard.", subtitle: "You only need to do this once.")
                    instruction(1, "In Settings, go to General › Keyboard › Keyboards › Add New Keyboard › Murmur.")
                    instruction(2, "Tap Murmur in the Keyboards list, then turn on Allow Full Access.")
                    Text("Full Access lets the keyboard and Murmur share your finished text through a private App Group. Nothing leaves your phone.").font(.callout)
                    settingsButton
                case 3:
                    PageHeading(title: "Try your first line.", subtitle: "Start a session below. Tap the field, hold the globe key, and choose Murmur. Tap the mic, speak, then tap the checkmark.")
                    if session.state.sessionActive {
                        Label("Session active", systemImage: "checkmark.circle.fill")
                    } else {
                        Button(session.preparing ? "Getting ready…" : "Start a session") { session.start() }
                            .buttonStyle(.bordered).disabled(session.preparing)
                        if let message = session.state.message { Text(message).font(.callout) }
                    }
                    TextField("Try dictating here", text: $trial, axis: .vertical)
                        .lineLimit(3...8).padding(16).background(.white, in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("Practice dictation")
                default:
                    PageHeading(title: "You’re all set.", subtitle: "Next time you’re typing, choose Murmur with the globe key. If a session has ended, open Murmur to start another.")
                }
            }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                Button(step == 4 ? "Done" : "Continue") { step += 1 }.buttonStyle(PrimaryAction())
                HStack {
                    if step > 0 { Button("Back") { step -= 1 }.frame(minHeight: 44) }
                    Spacer()
                    Button("Finish later", action: finishLater).frame(minHeight: 44)
                }
            }.padding(.horizontal, 24).padding(.vertical, 8).background(Paper.background)
        }
        .background(Paper.background.ignoresSafeArea())
        .onChange(of: scenePhase) { _, value in
            if value == .active { permission = AVAudioApplication.shared.recordPermission }
        }
    }

    private var settingsButton: some View {
        Button("Open Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
            .buttonStyle(.bordered)
    }

    private func instruction(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(number).").font(.headline)
            Text(text)
        }.accessibilityElement(children: .combine)
    }
}
