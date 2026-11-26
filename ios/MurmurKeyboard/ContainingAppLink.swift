import UIKit

@MainActor
enum ContainingAppLink {
    // Keyboards have no UIApplication.shared. For an explicit user tap only, try the
    // host responder's modern URL opener. iOS may refuse; show a manual route then.
    static func open(startSession: Bool, from first: UIResponder, completion: @escaping (Bool) -> Void) {
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        guard let url = URL(string: startSession ? "murmur://session/start" : "murmur://home"),
              let appClass = NSClassFromString("UIApplication") else { completion(false); return }
        typealias Reply = @convention(block) (Bool) -> Void
        typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, Reply) -> Void
        var next: UIResponder? = first
        while let responder = next {
            if responder.isKind(of: appClass), responder.responds(to: selector) {
                let openURL = unsafeBitCast(responder.method(for: selector), to: Open.self)
                openURL(responder, selector, url as NSURL, NSDictionary(), { success in completion(success) })
                return
            }
            next = responder.next
        }
        completion(false)
    }
}
