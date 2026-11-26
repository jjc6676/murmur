import UIKit

private let lavender = UIColor(red: 235/255, green: 221/255, blue: 251/255, alpha: 1)
private let cream = UIColor(red: 1, green: 253/255, blue: 232/255, alpha: 1)
private let ink = UIColor(white: 0.10, alpha: 1)

// The same five-bar mark becomes a scrolling, 19-sample envelope during recording.
private final class MurmurBars: UIView {
    var recording = false {
        didSet {
            guard recording != oldValue else { return }
            for index in samples.indices { samples[index] = 0 }
            nextSample = 0
            setNeedsDisplay()
        }
    }
    private var samples = [CGFloat](repeating: 0, count: 19)
    private var nextSample = 0

    func append(_ level: Float) {
        guard recording else { return }
        samples[nextSample] = CGFloat(min(1, max(0, level))).squareRoot()
        nextSample = (nextSample + 1) % samples.count
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        let count = recording ? samples.count : 5
        let stride: CGFloat = recording ? 5.5 : 6
        context.setStrokeColor(ink.cgColor)
        context.setLineCap(.round)
        context.setLineWidth(3.5)
        for i in 0..<count {
            let offset = i - count / 2
            let half: CGFloat
            if recording { half = 1 + 16 * samples[(nextSample + i) % count] }
            else { half = abs(offset) == 2 ? 2 : (offset == 0 ? 10 : 6) }
            let x = bounds.midX + CGFloat(offset) * stride
            context.move(to: CGPoint(x: x, y: bounds.midY - half))
            context.addLine(to: CGPoint(x: x, y: bounds.midY + half))
        }
        context.strokePath()
    }
}

final class KeyboardPanel: UIView {
    enum Mode { case access, inactive, ready, starting, recording, finishing, transcribing }
    let mic = UIButton(type: .system)
    let cancel = UIButton(type: .system)
    let finish = UIButton(type: .system)
    let globe = UIButton(type: .system)
    let deleteKey = UIButton(type: .system)
    let returnKey = UIButton(type: .system)
    private let bars = MurmurBars()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let notice = UILabel()
    private var mode: Mode?
    var typeText: ((String) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .systemGroupedBackground
        let keys = UIStackView()
        keys.spacing = 4
        keys.translatesAutoresizingMaskIntoConstraints = false
        addSubview(keys)
        func key(_ button: UIButton, title: String? = nil, icon: String? = nil, name: String, width: CGFloat? = nil) {
            button.setTitle(title, for: .normal)
            if let icon { button.setImage(UIImage(systemName: icon), for: .normal) }
            button.accessibilityLabel = name
            button.titleLabel?.font = .systemFont(ofSize: 15)
            button.titleLabel?.adjustsFontSizeToFitWidth = true
            button.tintColor = .label
            button.backgroundColor = .secondarySystemGroupedBackground
            button.layer.cornerRadius = 6
            button.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            keys.addArrangedSubview(button)
            if let width {
                let size = button.widthAnchor.constraint(equalTo: keys.widthAnchor, multiplier: width)
                size.priority = .defaultHigh
                size.isActive = true
            }
        }
        key(globe, icon: "globe", name: "Next keyboard", width: 0.10)
        for (title, name) in [(",", "Comma"), (".", "Period"), ("?", "Question mark"), ("space", "Space")] {
            let button = UIButton(type: .system)
            key(button, title: title, name: name, width: title == "space" ? nil : 0.10)
            button.addAction(UIAction { [weak self] _ in self?.typeText?(title == "space" ? " " : title) }, for: .touchUpInside)
        }
        key(deleteKey, icon: "delete.left", name: "Delete", width: 0.12)
        key(returnKey, title: "return", name: "Return", width: 0.17)

        let row = UIStackView(arrangedSubviews: [cancel, mic, finish])
        row.spacing = 10
        row.alignment = .center
        mic.backgroundColor = lavender
        mic.tintColor = ink
        mic.layer.cornerRadius = 32
        mic.titleLabel?.font = .systemFont(ofSize: 19, weight: .semibold)
        mic.heightAnchor.constraint(equalToConstant: 64).isActive = true
        bars.backgroundColor = .clear
        bars.isOpaque = false
        bars.isUserInteractionEnabled = false
        bars.translatesAutoresizingMaskIntoConstraints = false
        mic.addSubview(bars)
        spinner.color = ink
        spinner.isUserInteractionEnabled = false
        spinner.translatesAutoresizingMaskIntoConstraints = false
        mic.addSubview(spinner)
        for (button, image, label) in [(cancel, "xmark", "Cancel dictation"), (finish, "checkmark", "Finish dictation")] {
            button.setImage(UIImage(systemName: image, withConfiguration: UIImage.SymbolConfiguration(weight: .semibold)), for: .normal)
            button.accessibilityLabel = label
            button.backgroundColor = button === finish ? cream : .secondarySystemGroupedBackground
            button.tintColor = button === finish ? ink : .label
            button.layer.cornerRadius = 24
            button.heightAnchor.constraint(equalToConstant: 48).isActive = true
            // Hidden arranged subviews collapse to zero width while idle.
            let width = button.widthAnchor.constraint(equalToConstant: 48)
            width.priority = .defaultHigh
            width.isActive = true
        }
        notice.font = .preferredFont(forTextStyle: .subheadline)
        notice.adjustsFontForContentSizeCategory = true
        notice.textColor = .secondaryLabel
        notice.textAlignment = .center
        notice.numberOfLines = 2
        let voice = UIStackView(arrangedSubviews: [row, notice])
        voice.axis = .vertical
        voice.spacing = 12
        voice.translatesAutoresizingMaskIntoConstraints = false
        addSubview(voice)
        let area = UILayoutGuide()
        addLayoutGuide(area)
        let safe = safeAreaLayoutGuide
        let fill = voice.widthAnchor.constraint(equalTo: area.widthAnchor, constant: -32)
        fill.priority = .defaultHigh
        NSLayoutConstraint.activate([
            keys.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 6),
            keys.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -6),
            keys.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -6),
            keys.heightAnchor.constraint(equalToConstant: 48),
            area.topAnchor.constraint(equalTo: safe.topAnchor), area.bottomAnchor.constraint(equalTo: keys.topAnchor),
            area.leadingAnchor.constraint(equalTo: safe.leadingAnchor), area.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            voice.centerXAnchor.constraint(equalTo: area.centerXAnchor), voice.centerYAnchor.constraint(equalTo: area.centerYAnchor),
            voice.widthAnchor.constraint(lessThanOrEqualToConstant: 380), fill,
            bars.leadingAnchor.constraint(equalTo: mic.leadingAnchor), bars.trailingAnchor.constraint(equalTo: mic.trailingAnchor),
            bars.topAnchor.constraint(equalTo: mic.topAnchor), bars.bottomAnchor.constraint(equalTo: mic.bottomAnchor),
            spinner.centerXAnchor.constraint(equalTo: mic.centerXAnchor), spinner.centerYAnchor.constraint(equalTo: mic.centerYAnchor)
        ])
    }

    required init?(coder: NSCoder) { return nil }

    func render(_ newMode: Mode, message: String, holding: Bool) {
        if notice.text != message { notice.text = message }
        let hideSides = newMode != .recording || holding
        if cancel.isHidden != hideSides { cancel.isHidden = hideSides; finish.isHidden = hideSides }
        guard mode != newMode else { return }
        mode = newMode
        let busy = newMode == .transcribing || newMode == .finishing
        bars.recording = newMode == .recording
        bars.isHidden = busy || newMode == .access
        if busy { spinner.startAnimating() } else { spinner.stopAnimating() }
        mic.setTitle(newMode == .access ? "Open Murmur" : nil, for: .normal)
        mic.isEnabled = !busy
        switch newMode {
        case .access, .inactive: mic.accessibilityLabel = "Open Murmur"
        case .ready: mic.accessibilityLabel = "Start dictation"
        case .recording, .starting: mic.accessibilityLabel = "Finish dictation"
        case .transcribing, .finishing: mic.accessibilityLabel = message
        }
        mic.accessibilityHint = newMode == .ready ? "Tap once, or hold while speaking and release to finish." : nil
    }

    func appendLevel(_ level: Float) { bars.append(level) }
}
