import ScreenSaver
import WebKit

final class FolderHandler: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path == "/" || path.isEmpty { path = "/index.html" }
        let file = root.appendingPathComponent(path)
        guard let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "spike", code: 404)); return
        }
        let mime: String
        switch file.pathExtension {
        case "html": mime = "text/html"
        case "js": mime = "text/javascript"
        case "css": mime = "text/css"
        case "svg": mime = "image/svg+xml"
        case "woff2": mime = "font/woff2"
        default: mime = "application/octet-stream"
        }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
                                   headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)"])!
        task.didReceive(resp); task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

@objc(SpikeView)
final class SpikeView: ScreenSaverView {
    private var web: WKWebView?

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        let bundle = Bundle(for: SpikeView.self)
        let root = bundle.resourceURL!.appendingPathComponent("web")
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(FolderHandler(root: root), forURLScheme: "rx")
        let w = WKWebView(frame: bounds, configuration: cfg)
        w.autoresizingMask = [.width, .height]
        w.setValue(false, forKey: "drawsBackground")
        addSubview(w)
        web = w
        w.load(URLRequest(url: URL(string: "rx://app/index.html?seed=1&preview=\(isPreview ? 1 : 0)")!))
    }
    required init?(coder: NSCoder) { fatalError() }
    override func startAnimation() { super.startAnimation() }
    override func stopAnimation() {
        web?.removeFromSuperview(); web = nil
        super.stopAnimation()
    }
    override var hasConfigureSheet: Bool { false }
}
