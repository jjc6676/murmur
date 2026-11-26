import MurmurCore
import SwiftUI

enum RuleKind: String {
    case dictionary, snippets
    var title: String { self == .dictionary ? "Dictionary" : "Snippets" }
    var noun: String { self == .dictionary ? "word" : "snippet" }
    var subtitle: String {
        self == .dictionary ? "Teach Murmur how to write names, terms, and the words you use most." : "Turn a short spoken phrase into text you use often."
    }
}

struct RulesView: View {
    let store: MurmurStore
    let kind: RuleKind
    @State private var rules: [MurmurStore.Rule] = []
    @State private var adding = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            List {
                PageHeading(title: kind.title, subtitle: kind.subtitle)
                    .listRowInsets(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0)).listRowBackground(Color.clear)
                Section {
                    Button { adding = true } label: { Label("Add \(kind.noun)", systemImage: "plus") }
                    if rules.isEmpty {
                        Text(kind == .dictionary ? "Try a name Murmur often mishears. Enter what you say and the spelling you want." : "For example, say “my email” to insert your email address.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(rules, id: \.id) { rule in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(rule.phrase).font(.headline)
                            Text(rule.replacement).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }.onDelete(perform: delete)
                }
            }
            .scrollContentBackground(.hidden).background(Paper.background)
            .navigationTitle(kind.title).navigationBarTitleDisplayMode(.inline)
            .toolbar { if !rules.isEmpty { EditButton() } }
            .onAppear(perform: refresh)
            .sheet(isPresented: $adding) {
                RuleEditor(kind: kind) { phrase, replacement in
                    _ = try store.addRule(kind: kind.rawValue, phrase: phrase, replacement: replacement)
                    refresh()
                }
            }
            .errorAlert($issue)
        }
    }

    private func refresh() {
        do { rules = try store.rules(kind: kind.rawValue) }
        catch { issue = error.localizedDescription }
    }

    private func delete(_ indices: IndexSet) {
        do { for index in indices { try store.deleteRule(id: rules[index].id) } }
        catch { issue = error.localizedDescription }
        refresh()
    }
}

private struct RuleEditor: View {
    let kind: RuleKind
    let save: (String, String) throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var spoken = ""
    @State private var written = ""
    @State private var issue: String?
    private var phrase: String { spoken.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var replacement: String { written.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section("When I say") { TextField("Spoken phrase", text: $spoken).textInputAutocapitalization(.never) }
                Section(kind == .dictionary ? "Write this instead" : "Insert this text") {
                    TextField(kind == .dictionary ? "Preferred spelling" : "Expanded text", text: $written, axis: .vertical).lineLimit(2...12)
                }
            }
            .scrollContentBackground(.hidden).background(Paper.background)
            .navigationTitle("Add \(kind.noun)").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        do { try save(phrase, replacement); dismiss() }
                        catch { issue = error.localizedDescription }
                    }.disabled(phrase.isEmpty || replacement.isEmpty)
                }
            }
            .errorAlert($issue)
        }
    }
}
