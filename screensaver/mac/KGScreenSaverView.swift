import ScreenSaver
import WebKit
import os

private let log = Logger(subsystem: "com.reshapex.knowledge-graph", category: "saver")

/// Mirrors 3 * LOOP in src/schedule.ts (LOOP = 20 s). Each re-roll loads a new random seed.
private let rerollSeconds: TimeInterval = 60
private let fadeSeconds: TimeInterval = 0.6

/// Serves the bundled web build over rx://app/ (module scripts do not load from file://).
private final class BundleHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        let path = url.path == "/" ? "/index.html" : url.path
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            log.error("404 \(url.path, privacy: .public)")
            return task.didFailWithError(URLError(.fileDoesNotExist))
        }
        let types = ["html": "text/html", "js": "text/javascript", "css": "text/css", "svg": "image/svg+xml", "woff2": "font/woff2", "woff": "font/woff"]
        let headers = ["Content-Type": types[file.pathExtension] ?? "application/octet-stream", "Content-Length": "\(data.count)"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// Counts requestAnimationFrame callbacks (for fps logging) and forwards page errors to the host log.
private let hostScript = """
(function () {
  var n = 0, raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { return raf(function (t) { n++; cb(t); }); };
  window.__frames = function () { return n; };
  window.addEventListener('error', function (e) { window.webkit.messageHandlers.kgError.postMessage(String(e.message)); });
})();
"""

@objc(KGScreenSaverView)
final class KGScreenSaverView: ScreenSaverView, WKNavigationDelegate, WKScriptMessageHandler {
    private var web: WKWebView?
    private var rerollTimer: Timer?
    private var fpsTimer: Timer?
    private var lastFrames = 0
    private let previewMode: Bool

    override init?(frame: NSRect, isPreview: Bool) {
        previewMode = isPreview
        super.init(frame: frame, isPreview: isPreview)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        log.notice("init preview=\(isPreview, privacy: .public) size=\(NSStringFromSize(frame.size), privacy: .public)")
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    override var hasConfigureSheet: Bool { false }

    // legacyScreenSaver calls startAnimation/stopAnimation repeatedly: (re)build on start, tear down on stop.
    override func startAnimation() {
        super.startAnimation()
        guard web == nil else { return }
        makeWeb()
        rerollTimer = Timer.scheduledTimer(withTimeInterval: rerollSeconds, repeats: true) { [weak self] _ in self?.reroll() }
        fpsTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.logFps() }
    }

    override func stopAnimation() {
        rerollTimer?.invalidate(); rerollTimer = nil
        fpsTimer?.invalidate(); fpsTimer = nil
        web?.removeFromSuperview(); web = nil
        super.stopAnimation()
    }

    private func makeWeb() {
        let config = WKWebViewConfiguration()
        let root = Bundle(for: KGScreenSaverView.self).resourceURL!.appendingPathComponent("web")
        config.setURLSchemeHandler(BundleHandler(root: root), forURLScheme: "rx")
        config.userContentController.addUserScript(WKUserScript(source: hostScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "kgError")
        let w = WKWebView(frame: bounds, configuration: config)
        w.autoresizingMask = [.width, .height]
        w.navigationDelegate = self
        w.setValue(false, forKey: "drawsBackground")
        // legacyScreenSaver windows are reported occluded, so WebKit hides the page and stops rAF (see spike notes).
        let sel = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
        guard w.responds(to: sel), let imp = w.method(for: sel) else { return showError("WKWebView lacks _setWindowOcclusionDetectionEnabled:") }
        typealias SetBool = @convention(c) (AnyObject, Selector, Bool) -> Void
        unsafeBitCast(imp, to: SetBool.self)(w, sel, false)
        addSubview(w)
        web = w
        loadNewSeed()
    }

    private func loadNewSeed() {
        let seed = UInt32.random(in: 0...UInt32.max)
        log.notice("load seed=\(seed, privacy: .public)")
        lastFrames = 0
        web?.load(URLRequest(url: URL(string: "rx://app/index.html?seed=\(seed)&density=1")!))
    }

    private func reroll() {
        guard let w = web else { return }
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = fadeSeconds
            w.animator().alphaValue = 0
        }, completionHandler: { [weak self] in self?.loadNewSeed() })
    }

    private func logFps() {
        web?.evaluateJavaScript("window.__frames()") { [weak self] value, _ in
            guard let self, let n = value as? Int else { return }
            log.notice("fps=\(Double(n - self.lastFrames) / 5, format: .fixed(precision: 1), privacy: .public) preview=\(self.previewMode, privacy: .public)")
            self.lastFrames = n
        }
    }

    // MARK: fail fast, visibly
    private func showError(_ message: String) {
        log.error("\(message, privacy: .public)")
        web?.removeFromSuperview(); web = nil
        let label = NSTextField(wrappingLabelWithString: "screensaver error: \(message)")
        label.textColor = NSColor(red: 1, green: 0, blue: 0.43, alpha: 1)
        label.frame = bounds.insetBy(dx: 24, dy: 24)
        label.autoresizingMask = [.width, .height]
        addSubview(label)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = fadeSeconds
            webView.animator().alphaValue = 1
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showError(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError(error.localizedDescription) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { showError("web content process terminated") }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) { showError("page error: \(message.body)") }
}
