using System.IO.Compression;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ReshapeX.KnowledgeGraph;

static class Program
{
    internal const int RerollSeconds = 60; // mirrors 3 * LOOP in src/schedule.ts (LOOP = 20 s)
    internal const int MaxPixels = 4_000_000; // canvas pixel budget, same as the macOS host
    internal const int PreviewPixels = 250_000;

    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        // Windows passes /s (run), /p <hwnd> (preview), /c[:hwnd] (configure), any case, with : or space.
        var first = (args.FirstOrDefault() ?? "/c").ToLowerInvariant().TrimStart('/', '-');
        var mode = first.Length > 0 ? first[0] : 'c';
        var hwndText = first.Contains(':') ? first[(first.IndexOf(':') + 1)..] : args.Skip(1).FirstOrDefault();
        try
        {
            switch (mode)
            {
                case 's':
                    foreach (var screen in Screen.AllScreens) new SaverForm(screen.Bounds, WebRoot()).Show();
                    Application.Run();
                    break;
                case 'p':
                    var parent = new IntPtr(long.Parse(hwndText ?? throw new ArgumentException("/p needs a window handle")));
                    Application.Run(new SaverForm(parent, WebRoot()));
                    break;
                default:
                    MessageBox.Show("ReshapeX Knowledge Graph has no options.", "ReshapeX Knowledge Graph");
                    break;
            }
        }
        catch (Exception e)
        {
            MessageBox.Show(e.ToString(), "ReshapeX Knowledge Graph error"); // fail fast, visibly
            Environment.Exit(1);
        }
    }

    /// <summary>Extracts the embedded web build once per build (keyed by exe write time) and returns its folder.</summary>
    static string WebRoot()
    {
        var stamp = File.GetLastWriteTimeUtc(Environment.ProcessPath!).Ticks;
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReshapeXKnowledgeGraph", $"web-{stamp}");
        if (Directory.Exists(root)) return root;
        using var zip = typeof(Program).Assembly.GetManifestResourceStream("web.zip") ?? throw new InvalidOperationException("web.zip not embedded");
        ZipFile.ExtractToDirectory(zip, root + ".tmp", overwriteFiles: true);
        Directory.Move(root + ".tmp", root);
        return root;
    }
}

sealed class SaverForm : Form
{
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hwnd, int index, int value);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }

    readonly WebView2 web = new() { DefaultBackgroundColor = Color.Black, Dock = DockStyle.Fill };
    readonly string webRoot;
    readonly bool preview;
    readonly IntPtr previewParent;
    readonly System.Windows.Forms.Timer reroll = new() { Interval = Program.RerollSeconds * 1000 };

    // Full-screen form for one monitor.
    public SaverForm(Rectangle bounds, string webRoot) : this(webRoot, false, IntPtr.Zero)
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = bounds;
        TopMost = true;
        Cursor.Hide();
    }

    // Child of the Screen Saver Settings preview window. Position and size are set after reparenting:
    // before the handle exists WinForms would create the window at CW_USEDEFAULT and keep that offset.
    public SaverForm(IntPtr parent, string webRoot) : this(webRoot, true, parent)
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        GetClientRect(parent, out var r);
        var size = new Size(r.Right - r.Left, r.Bottom - r.Top);
        SetParent(Handle, parent); // creates the handle
        const int GwlStyle = -16, WsPopup = unchecked((int)0x80000000), WsChild = 0x40000000;
        SetWindowLong(Handle, GwlStyle, (GetWindowLong(Handle, GwlStyle) & ~WsPopup) | WsChild);
        Bounds = new Rectangle(Point.Empty, size);
        Show();
    }

    SaverForm(string webRoot, bool preview, IntPtr previewParent)
    {
        this.webRoot = webRoot;
        this.preview = preview;
        this.previewParent = previewParent;
        BackColor = Color.Black;
        Controls.Add(web);
        Load += async (_, _) => await Start();
        reroll.Tick += (_, _) => { web.Visible = false; Navigate(); }; // black form shows while the next seed builds
        FormClosed += (_, _) => { if (!preview && Application.OpenForms.Count == 0) Application.Exit(); };
    }

    async Task Start()
    {
        var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReshapeXKnowledgeGraph", "webview2"); // exe dir (System32) is not writable
        var env = await CoreWebView2Environment.CreateAsync(null, userData);
        await web.EnsureCoreWebView2Async(env);
        var core = web.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.SetVirtualHostNameToFolderMapping("kg.local", webRoot, CoreWebView2HostResourceAccessKind.Allow);
        // The WebView2 child window swallows input, so the page reports it: any key, click, or >10 px of mouse movement exits.
        await core.AddScriptToExecuteOnDocumentCreatedAsync("""
            (function () {
              var x = null, y = null, post = function (m) { window.chrome.webview.postMessage(m); };
              addEventListener('keydown', function () { post('exit'); });
              addEventListener('mousedown', function () { post('exit'); });
              addEventListener('pointermove', function (e) {
                if (x === null) { x = e.screenX; y = e.screenY; return; }
                if (Math.abs(e.screenX - x) + Math.abs(e.screenY - y) > 10) post('exit');
              });
              addEventListener('error', function (e) { post('error:' + e.message); });
            })();
            """);
        core.WebMessageReceived += (_, e) =>
        {
            var msg = e.TryGetWebMessageAsString();
            if (msg == "exit" && !preview) Application.Exit();
            else if (msg.StartsWith("error:")) Fail(msg);
        };
        core.NavigationCompleted += (_, e) =>
        {
            if (!e.IsSuccess) Fail($"navigation failed: {e.WebErrorStatus}");
            else web.Visible = true;
        };
        core.ProcessFailed += (_, e) => Fail($"web process failed: {e.ProcessFailedKind}");
        Navigate();
        reroll.Start();
        if (preview) { var watch = new System.Windows.Forms.Timer { Interval = 1000 }; watch.Tick += (_, _) => { if (!IsWindow(previewParent)) Application.Exit(); }; watch.Start(); }
    }

    void Navigate()
    {
        var seed = Random.Shared.NextInt64(0, 4294967296L);
        var pixels = preview ? Program.PreviewPixels : Program.MaxPixels;
        web.CoreWebView2.Navigate($"https://kg.local/index.html?seed={seed}&density=1&maxpx={pixels}");
    }

    void Fail(string message)
    {
        reroll.Stop();
        web.Visible = false;
        Controls.Add(new Label { Text = "screensaver error: " + message, ForeColor = Color.FromArgb(255, 0, 110), Dock = DockStyle.Fill, Font = new Font("Consolas", 12) });
    }
}
