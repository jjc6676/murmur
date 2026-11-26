import Foundation
import CoreFoundation

/// Darwin notifications are wake-ups only. Never put dictated text in a notification.
public enum MurmurIPC {
    public static let appGroup = "group.com.jjc6676.murmur"
    public static let startCmd = "com.jjc6676.murmur.cmd.start"
    public static let stopCmd = "com.jjc6676.murmur.cmd.stop"
    public static let cancelCmd = "com.jjc6676.murmur.cmd.cancel"
    public static let stateChanged = "com.jjc6676.murmur.state"

    public static func post(_ name: String) {
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(rawValue: name as CFString), nil, nil, true)
    }

    // A CF callback may already be in flight when its token is released. Pass an
    // opaque numeric key, not an unretained Swift object that CF could outlive.
    private static let lock = NSLock()
    private static var nextID = 0
    private static var handlers: [Int: () -> Void] = [:]

    private static func handler(for id: Int) -> (() -> Void)? {
        lock.lock(); defer { lock.unlock() }
        return handlers[id]
    }

    /// Keep the token alive as long as notifications are wanted. A handler may
    /// run on the notification delivery thread; dispatch to the UI as needed.
    public static func observe(_ name: String, _ handler: @escaping () -> Void) -> AnyObject {
        lock.lock()
        nextID += 1
        let id = nextID
        handlers[id] = handler
        lock.unlock()
        let token = Token(id: id, name: name)
        CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),
            UnsafeRawPointer(bitPattern: id), { _, observer, _, _, _ in
                guard let observer else { return }
                MurmurIPC.handler(for: Int(bitPattern: observer))?()
            }, name as CFString, nil, .deliverImmediately)
        return token
    }

    private final class Token {
        let id: Int
        let name: String
        init(id: Int, name: String) { self.id = id; self.name = name }
        deinit {
            CFNotificationCenterRemoveObserver(CFNotificationCenterGetDarwinNotifyCenter(),
                UnsafeRawPointer(bitPattern: id), CFNotificationName(rawValue: name as CFString), nil)
            lock.lock()
            let removed = handlers.removeValue(forKey: id)
            lock.unlock()
            // Do not release captured objects (which may own tokens) under the lock.
            withExtendedLifetime(removed) {}
        }
    }
}
