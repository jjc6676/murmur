import MurmurCore
import SwiftUI
import UIKit

struct HomeView: View {
    @ObservedObject var session: DictationSession
    let resumeSetup: (() -> Void)?
    let openSession: () -> Void
    @AppStorage("history_enabled", store: Paper.preferences) private var enabled = true
    @State private var query = ""
    @State private var page = 0
    @State private var entries: [MurmurStore.Dictation] = []
    @State private var stats: MurmurStore.Stats?
    @State private var copied: Int64?
    @State private var issue: String?
    @State private var loading = true
    private static let pageSize = 40

    private struct Request: Equatable {
        let enabled: Bool
        let revision: Int
        let page: Int
        let query: String
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    PageHeading(title: "Your words", subtitle: "A private notebook of the things you’ve dictated.")
                        .listRowInsets(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0)).listRowBackground(Color.clear)
                    Button(action: openSession) {
                        Label(session.state.sessionActive ? "Manage keyboard session" : "Start keyboard session", systemImage: "waveform")
                    }
                    if let resumeSetup { Button("Resume keyboard setup", action: resumeSetup) }
                }
                if enabled {
                    if let stats {
                        Section("At a glance") {
                            LabeledContent("Total words", value: stats.totalWords.formatted())
                            LabeledContent("Average words per minute", value: stats.averageWpm.formatted())
                            LabeledContent("Day streak", value: stats.streakDays.formatted())
                        }
                    }
                    Section("History") {
                        HStack {
                            Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                            TextField("Search dictations", text: $query).autocorrectionDisabled()
                        }
                        if loading { ProgressView().accessibilityLabel("Loading history") }
                        else if entries.isEmpty {
                            Text(query.isEmpty ? "Your first saved dictation will appear here." : "No dictations match this search.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(entries.prefix(Self.pageSize), id: \.id) { row in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(row.createdAt.formatted(date: .abbreviated, time: .shortened))
                                        .font(.caption).foregroundStyle(.secondary)
                                    Text(row.text).textSelection(.enabled)
                                    HStack(spacing: 20) {
                                        Button(copied == row.id ? "Copied" : "Copy") {
                                            UIPasteboard.general.string = row.text
                                            copied = row.id
                                        }
                                        ShareLink(item: row.text) { Text("Share") }
                                        Button("Delete", role: .destructive) { delete(row.id) }
                                    }.font(.callout).buttonStyle(.borderless).frame(minHeight: 44)
                                }.padding(.vertical, 4)
                            }
                        }
                        if page > 0 || entries.count > Self.pageSize {
                            HStack {
                                Button("Previous") { page -= 1 }.disabled(page == 0)
                                Spacer()
                                Button("Next") { page += 1 }.disabled(entries.count <= Self.pageSize)
                            }.buttonStyle(.borderless)
                        }
                    }
                } else {
                    Section("History is off") { Text("New dictations aren’t saved. You can manage existing history in Settings.") }
                }
            }
            .scrollContentBackground(.hidden).background(Paper.background)
            .navigationTitle("Murmur").navigationBarTitleDisplayMode(.inline)
            .onChange(of: query) { _, _ in page = 0 }
            .task(id: Request(enabled: enabled, revision: session.historyRevision, page: page, query: query)) { await loadHistory() }
            .task(id: enabled ? session.historyRevision : -1) { await loadStats() }
            .errorAlert($issue)
        }
    }

    @MainActor private func loadHistory() async {
        loading = true
        guard enabled else { entries = []; page = 0; return }
        let store = session.store, term = query, offset = page * Self.pageSize, limit = Self.pageSize + 1
        do {
            if !term.isEmpty { try await Task.sleep(for: .milliseconds(180)) }
            let result = try await Task.detached(priority: .userInitiated) {
                try store.history(query: term, limit: limit, offset: offset)
            }.value
            try Task.checkCancellation()
            entries = result
            if result.isEmpty && page > 0 { page -= 1 }
        } catch {
            guard !Task.isCancelled else { return }
            entries = []; issue = error.localizedDescription
        }
        loading = false
    }

    @MainActor private func loadStats() async {
        guard enabled else { stats = nil; return }
        let store = session.store
        do {
            let result = try await Task.detached { try store.stats() }.value
            if !Task.isCancelled { stats = result }
        } catch { if !Task.isCancelled { issue = error.localizedDescription } }
    }

    private func delete(_ id: Int64) {
        do { try session.store.deleteDictation(id: id); session.historyDidChange() }
        catch { issue = error.localizedDescription }
    }
}

extension View {
    func errorAlert(_ error: Binding<String?>) -> some View {
        alert("Murmur couldn’t finish", isPresented: Binding(get: { error.wrappedValue != nil }, set: { if !$0 { error.wrappedValue = nil } })) {
            Button("OK", role: .cancel) { error.wrappedValue = nil }
        } message: { Text(error.wrappedValue ?? "") }
    }
}
