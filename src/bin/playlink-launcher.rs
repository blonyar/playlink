// Playlink Launcher

use std::collections::VecDeque;
use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use eframe::egui;
use serde::{Deserialize, Serialize};

const MAX_LOG_LINES: usize = 2000;
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const REPAINT_INTERVAL: Duration = Duration::from_millis(250);
const CONFIG_FILE: &str = "playlink-launcher.json";
const BROWSER_OPEN_DELAY: Duration = Duration::from_secs(2);

const BG: egui::Color32 = egui::Color32::from_rgb(0xF1, 0xBF, 0x98);
const SURFACE: egui::Color32 = egui::Color32::from_rgb(0xE1, 0xF4, 0xCB);
const LINE: egui::Color32 = egui::Color32::from_rgb(0xBA, 0xCB, 0xA9);
const DIM: egui::Color32 = egui::Color32::from_rgb(0x71, 0x75, 0x68);
const TEXT: egui::Color32 = egui::Color32::from_rgb(0x3F, 0x47, 0x39);

fn al(col: egui::Color32, a: f32) -> egui::Color32 {
    let [r, g, b, _] = col.to_srgba_unmultiplied();
    egui::Color32::from_rgba_unmultiplied(r, g, b, (a * 255.0) as u8)
}

fn style() -> egui::Style {
    let mut s = egui::Style::default();
    s.visuals.window_fill = BG;
    s.visuals.panel_fill = BG;
    s.visuals.window_rounding = egui::Rounding::same(4.0);
    s.spacing.item_spacing = egui::vec2(8.0, 4.0);
    s.spacing.window_margin = egui::Margin::same(6.0);
    s
}

// ═══════════════════  domain types  ═══════════════════

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
enum ServiceStatus {
    Stopped,
    Starting,
    Running,
    Crashed,
}

impl ServiceStatus {
    fn label(self) -> &'static str {
        match self {
            Self::Stopped => "Stopped",
            Self::Starting => "Starting",
            Self::Running => "Running",
            Self::Crashed => "Crashed",
        }
    }
    fn dot_color(self) -> eframe::egui::Color32 {
        match self {
            Self::Running => DIM,
            Self::Stopped => LINE,
            Self::Starting => TEXT,
            Self::Crashed => TEXT,
        }
    }
    fn is_active(self) -> bool {
        matches!(self, Self::Running | Self::Starting)
    }
}

#[derive(Clone)]
struct LogLine {
    service: String,
    text: String,
    timestamp: chrono::DateTime<chrono::Local>,
}

type SharedLog = Arc<Mutex<VecDeque<LogLine>>>;

fn push_log(log: &SharedLog, service: impl Into<String>, text: impl Into<String>) {
    let line = LogLine {
        service: service.into(),
        text: text.into(),
        timestamp: chrono::Local::now(),
    };
    if let Ok(mut g) = log.lock() {
        if g.len() >= MAX_LOG_LINES {
            g.pop_front();
        }
        g.push_back(line);
    }
}

// ═══════════════════  service lifecycle  ═══════════════════

#[derive(Clone)]
struct ServiceHandle {
    name: String,
    status: Arc<Mutex<ServiceStatus>>,
    pid: Arc<AtomicU32>,
    started_at: Arc<Mutex<Option<Instant>>>,
    child: Arc<Mutex<Option<Child>>>,
}

impl ServiceHandle {
    fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            status: Arc::new(Mutex::new(ServiceStatus::Stopped)),
            pid: Arc::new(AtomicU32::new(0)),
            started_at: Arc::new(Mutex::new(None)),
            child: Arc::new(Mutex::new(None)),
        }
    }

    fn status(&self) -> ServiceStatus {
        *self.status.lock().unwrap()
    }
    fn is_running(&self) -> bool {
        self.status().is_active()
    }
    fn pid(&self) -> u32 {
        self.pid.load(Ordering::SeqCst)
    }

    fn start(&self, mut cmd: Command, log: &SharedLog) -> Result<u32, String> {
        {
            let mut s = self.status.lock().unwrap();
            if s.is_active() {
                return Err(format!("{} already running", self.name));
            }
            *s = ServiceStatus::Starting;
        }
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                *self.status.lock().unwrap() = ServiceStatus::Stopped;
                return Err(format!("Failed to start {}: {}", self.name, e));
            }
        };
        let pid = child.id();
        self.pid.store(pid, Ordering::SeqCst);
        *self.started_at.lock().unwrap() = Some(Instant::now());
        let stdout = child.stdout.take().expect("piped");
        let stderr = child.stderr.take().expect("piped");
        spawn_reader(self.name.clone(), Box::new(stdout), log.clone());
        spawn_reader(self.name.clone(), Box::new(stderr), log.clone());
        *self.status.lock().unwrap() = ServiceStatus::Running;
        *self.child.lock().unwrap() = Some(child);

        let c = Arc::clone(&self.child);
        let s = Arc::clone(&self.status);
        let p = Arc::clone(&self.pid);
        let t = Arc::clone(&self.started_at);
        let n = self.name.clone();
        let l = Arc::clone(log);
        thread::spawn(move || loop {
            thread::sleep(POLL_INTERVAL);
            let mut g = match c.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            match g.as_mut().and_then(|ch| ch.try_wait().ok()?) {
                Some(st) => {
                    let code = st
                        .code()
                        .map(|c| c.to_string())
                        .unwrap_or_else(|| "signal".into());
                    push_log(&l, "launcher", format!("{} exited (code: {})", n, code));
                    *s.lock().unwrap() = if st.success() {
                        ServiceStatus::Stopped
                    } else {
                        ServiceStatus::Crashed
                    };
                    p.store(0, Ordering::SeqCst);
                    *t.lock().unwrap() = None;
                    *g = None;
                    break;
                }
                None => continue,
            }
        });
        Ok(pid)
    }

    fn stop(&self) {
        let c = self.child.lock().ok().and_then(|mut g| g.take());
        if let Some(mut ch) = c {
            let _ = ch.kill();
            let _ = ch.wait();
        }
        if let Ok(mut s) = self.status.lock() {
            *s = ServiceStatus::Stopped;
        }
        self.pid.store(0, Ordering::SeqCst);
        *self.started_at.lock().unwrap() = None;
    }
}

fn spawn_reader(service: String, pipe: Box<dyn std::io::Read + Send>, log: SharedLog) {
    thread::spawn(move || {
        for line in std::io::BufReader::new(pipe).lines() {
            match line {
                Ok(t) => push_log(&log, service.clone(), t),
                Err(_) => break,
            }
        }
    });
}

// ═══════════════════  settings  ═══════════════════

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Settings {
    project_root: PathBuf,
    bind_addr: String,
    demo_port: u16,
    autostart_server: bool,
    autostart_demo: bool,
    open_browser_on_start: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            project_root: default_project_root(),
            bind_addr: "127.0.0.1:7777".to_string(),
            demo_port: 7780,
            autostart_server: false,
            autostart_demo: false,
            open_browser_on_start: true,
        }
    }
}

fn default_project_root() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        let mut d = exe.parent().map(std::path::Path::to_path_buf);
        for _ in 0..6 {
            if let Some(ref dir) = d {
                if dir.join("Cargo.toml").is_file() && dir.join("examples").is_dir() {
                    return dir.clone();
                }
                let mut p = dir.clone();
                p.pop();
                d = Some(p);
            }
        }
    }
    std::env::current_dir().unwrap_or_default()
}

fn config_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|d| d.join(CONFIG_FILE)))
        .unwrap_or_else(|| CONFIG_FILE.into())
}

fn load_settings() -> Settings {
    let p = config_path();
    std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(s: &Settings) {
    if let Ok(j) = serde_json::to_string_pretty(s) {
        let _ = std::fs::write(config_path(), j);
    }
}

// ═══════════════════  app  ═══════════════════

struct LauncherApp {
    settings: Settings,
    server: ServiceHandle,
    demo: ServiceHandle,
    log: SharedLog,
    auto_scroll: bool,
    show_settings: bool,
}

impl Drop for LauncherApp {
    fn drop(&mut self) {
        self.server.stop();
        self.demo.stop();
    }
}

impl LauncherApp {
    fn new() -> Self {
        let settings = load_settings();
        let log: SharedLog = Arc::new(Mutex::new(VecDeque::with_capacity(MAX_LOG_LINES)));
        let server = ServiceHandle::new("server");
        let demo = ServiceHandle::new("demo");

        push_log(
            &log,
            "launcher",
            format!("root: {}", settings.project_root.display()),
        );
        push_log(&log, "launcher", format!("bind: {}", settings.bind_addr));

        let mut app = Self {
            settings,
            server,
            demo,
            log,
            auto_scroll: true,
            show_settings: false,
        };
        if app.settings.autostart_server {
            app.start_server();
        }
        if app.settings.autostart_demo {
            app.start_demo();
        }
        app
    }

    fn cmd_server(&self) -> Command {
        let r = &self.settings.project_root;
        let exe = r.join("target").join("debug").join("playlink.exe");
        if exe.is_file() {
            let mut c = Command::new(&exe);
            c.current_dir(r)
                .env("PLAYLINK_BIND_ADDR", &self.settings.bind_addr);
            return c;
        }
        push_log(
            &self.log,
            "launcher",
            format!("no binary at {}, using cargo run", exe.display()),
        );
        let mut c = Command::new("rustup");
        c.args(["run", "stable", "cargo", "run", "--bin", "playlink"])
            .current_dir(r)
            .env("PLAYLINK_BIND_ADDR", &self.settings.bind_addr);
        c
    }

    fn start_server(&mut self) {
        match self.server.start(self.cmd_server(), &self.log) {
            Ok(pid) => push_log(
                &self.log,
                "launcher",
                format!("server started, pid={}", pid),
            ),
            Err(e) => push_log(&self.log, "launcher", format!("server: {}", e)),
        }
    }

    fn cmd_demo(&self) -> Command {
        let r = &self.settings.project_root;
        let s = r
            .join("examples")
            .join("js-client")
            .join("mini-game-server.js");
        let mut c = Command::new("node");
        c.arg(&s)
            .current_dir(r.join("examples").join("js-client"))
            .env(
                "PLAYLINK_MINI_GAME_PORT",
                self.settings.demo_port.to_string(),
            );
        c
    }

    fn start_demo(&mut self) {
        match self.demo.start(self.cmd_demo(), &self.log) {
            Ok(pid) => {
                push_log(&self.log, "launcher", format!("demo started, pid={}", pid));
                if self.settings.open_browser_on_start {
                    let url = format!("http://127.0.0.1:{}/tanks", self.settings.demo_port);
                    let l = Arc::clone(&self.log);
                    thread::spawn(move || {
                        thread::sleep(BROWSER_OPEN_DELAY);
                        push_log(&l, "launcher", format!("opening {}", url));
                        let _ = webbrowser::open(&url);
                    });
                }
            }
            Err(e) => push_log(&self.log, "launcher", format!("demo: {}", e)),
        }
    }
}

// ═══════════════════  UI  ═══════════════════

fn subtle_btn(ui: &mut egui::Ui, text: &str) -> egui::Response {
    ui.add(
        egui::Button::new(egui::RichText::new(text).color(TEXT).size(13.0))
            .min_size(egui::vec2(60.0, 28.0))
            .rounding(egui::Rounding::same(4.0))
            .fill(SURFACE)
            .stroke(egui::Stroke::new(1.0, LINE)),
    )
}

impl eframe::App for LauncherApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // ── header ──
        egui::TopBottomPanel::top("header")
            .frame(
                egui::Frame::none()
                    .fill(TEXT)
                    .inner_margin(egui::Margin::symmetric(14.0, 8.0)),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("Playlink Launcher")
                            .size(18.0)
                            .strong()
                            .color(SURFACE),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .add(
                                egui::Button::new(
                                    egui::RichText::new("⚙").color(SURFACE).size(16.0),
                                )
                                .min_size(egui::vec2(28.0, 28.0))
                                .rounding(egui::Rounding::same(4.0))
                                .fill(al(SURFACE, 0.1)),
                            )
                            .clicked()
                        {
                            self.show_settings = true;
                        }
                    });
                });
            });

        // ── services panel ──
        let server_h = self.server.clone();
        let demo_h = self.demo.clone();
        let bind_addr = self.settings.bind_addr.clone();
        let demo_port = self.settings.demo_port;

        egui::TopBottomPanel::top("services")
            .frame(
                egui::Frame::none()
                    .fill(BG)
                    .inner_margin(egui::Margin::symmetric(14.0, 8.0)),
            )
            .show(ctx, |ui| {
                self.render_service(
                    ui,
                    "Server",
                    &server_h,
                    &format!("ws://{}/ws", bind_addr),
                    |s| s.start_server(),
                    |s| s.server.stop(),
                    &format!("http://{}/", bind_addr),
                );
                ui.add_space(6.0);
                self.render_service(
                    ui,
                    "Demo",
                    &demo_h,
                    &format!("http://127.0.0.1:{}/tanks", demo_port),
                    |s| s.start_demo(),
                    |s| s.demo.stop(),
                    &format!("http://127.0.0.1:{}/tanks", demo_port),
                );

                // status bar
                ui.add_space(4.0);
                let sr = self.server.is_running();
                let dr = self.demo.is_running();
                let all_ok = sr && dr;
                let msg = if all_ok {
                    "✓ Both running — click to open game"
                } else if sr {
                    "• Server running, waiting for demo…"
                } else if dr {
                    "• Demo running, waiting for server…"
                } else {
                    "  Start the server to begin"
                };
                let bar_col = if all_ok { al(DIM, 0.3) } else { al(LINE, 0.3) };
                let msg_col = if all_ok { TEXT } else { DIM };
                if ui
                    .add(
                        egui::Button::new(egui::RichText::new(msg).color(msg_col).size(12.0))
                            .min_size(egui::vec2(ui.available_width(), 26.0))
                            .rounding(egui::Rounding::same(4.0))
                            .fill(bar_col),
                    )
                    .clicked()
                    && all_ok
                {
                    let _ = webbrowser::open(&format!("http://127.0.0.1:{}/tanks", demo_port));
                }
            });

        // ── log panel ──
        egui::CentralPanel::default()
            .frame(
                egui::Frame::none()
                    .fill(BG)
                    .inner_margin(egui::Margin::symmetric(14.0, 6.0)),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("Log").size(13.0).strong().color(TEXT));
                    if subtle_btn(ui, "Clear").clicked() {
                        self.log.lock().unwrap().clear();
                    }
                    let n = self.log.lock().map(|g| g.len()).unwrap_or(0);
                    ui.label(
                        egui::RichText::new(format!("{}/{}", n, MAX_LOG_LINES))
                            .color(DIM)
                            .size(11.0),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.checkbox(&mut self.auto_scroll, "Auto");
                    });
                });
                ui.add_space(4.0);
                egui::Frame::none()
                    .fill(SURFACE)
                    .rounding(egui::Rounding::same(4.0))
                    .stroke(egui::Stroke::new(1.0, al(LINE, 0.5)))
                    .inner_margin(egui::Margin::same(8.0))
                    .show(ui, |ui| {
                        egui::ScrollArea::vertical()
                            .stick_to_bottom(self.auto_scroll)
                            .auto_shrink([false, false])
                            .show(ui, |ui| {
                                let snap: Vec<LogLine> = self
                                    .log
                                    .lock()
                                    .map(|g| g.iter().cloned().collect())
                                    .unwrap_or_default();
                                for l in &snap {
                                    ui.horizontal(|ui| {
                                        ui.label(
                                            egui::RichText::new(format!(
                                                "{}",
                                                l.timestamp.format("%H:%M:%S")
                                            ))
                                            .color(DIM)
                                            .monospace()
                                            .size(11.0),
                                        );
                                        ui.add_space(4.0);
                                        ui.label(
                                            egui::RichText::new(format!("[{}]", l.service))
                                                .color(TEXT)
                                                .monospace()
                                                .size(11.0),
                                        );
                                        ui.add_space(4.0);
                                        ui.add(
                                            egui::Label::new(
                                                egui::RichText::new(&l.text)
                                                    .color(TEXT)
                                                    .monospace()
                                                    .size(11.0),
                                            )
                                            .wrap_mode(egui::TextWrapMode::Extend),
                                        );
                                    });
                                }
                            });
                    });
            });

        // ── settings modal ──
        if self.show_settings {
            let mut open = true;
            egui::Window::new("settings_modal")
                .open(&mut open)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .frame(
                    egui::Frame::none()
                        .fill(SURFACE)
                        .rounding(egui::Rounding::same(8.0))
                        .stroke(egui::Stroke::new(1.0, LINE))
                        .inner_margin(egui::Margin::same(16.0)),
                )
                .resizable(false)
                .collapsible(false)
                .title_bar(false)
                .show(ctx, |ui| self.settings_window(ui));
            if !open {
                self.show_settings = false;
            }
        }

        ctx.request_repaint_after(REPAINT_INTERVAL);
    }
}

// ═══════════════════  service row  ═══════════════════

impl LauncherApp {
    fn render_service(
        &mut self,
        ui: &mut egui::Ui,
        name: &str,
        svc: &ServiceHandle,
        endpoint: &str,
        on_start: impl FnOnce(&mut Self),
        on_stop: impl FnOnce(&mut Self),
        web_url: &str,
    ) {
        let status = svc.status();
        let running = status.is_active();
        let dot_c = status.dot_color();
        let pid = svc.pid();

        let bg_c = if running { al(TEXT, 0.04) } else { BG };
        let border_c = if running { al(TEXT, 0.12) } else { LINE };

        egui::Frame::none()
            .fill(bg_c)
            .rounding(egui::Rounding::same(6.0))
            .stroke(egui::Stroke::new(1.0, border_c))
            .inner_margin(egui::Margin::same(10.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    // dot
                    ui.vertical_centered(|ui| {
                        ui.add_space(2.0);
                        let r =
                            ui.allocate_exact_size(egui::vec2(14.0, 14.0), egui::Sense::hover());
                        ui.painter().circle_filled(r.1.rect.center(), 6.0, dot_c);
                    });
                    ui.add_space(8.0);

                    // name + status
                    ui.label(egui::RichText::new(name).size(14.0).strong().color(TEXT));
                    ui.add_space(6.0);
                    ui.label(
                        egui::RichText::new(status.label())
                            .color(if running { TEXT } else { DIM })
                            .size(12.0),
                    );
                    if pid != 0 {
                        ui.add_space(4.0);
                        ui.label(
                            egui::RichText::new(format!("pid={}", pid))
                                .color(al(DIM, 0.5))
                                .size(10.0)
                                .monospace(),
                        );
                    }

                    // right side: endpoint + buttons
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        // Start / Stop
                        let btn_text = if running { "Stop" } else { "Start" };
                        let (bf, bfg) = if running {
                            (al(DIM, 0.15), DIM)
                        } else {
                            (TEXT, SURFACE)
                        };
                        if ui
                            .add(
                                egui::Button::new(
                                    egui::RichText::new(btn_text).color(bfg).size(13.0).strong(),
                                )
                                .min_size(egui::vec2(80.0, 30.0))
                                .rounding(egui::Rounding::same(5.0))
                                .fill(bf),
                            )
                            .clicked()
                        {
                            if running {
                                on_stop(self);
                            } else {
                                on_start(self);
                            }
                        }

                        ui.add_space(8.0);

                        // web link
                        if ui
                            .add(
                                egui::Button::new(egui::RichText::new("🌐").size(14.0))
                                    .min_size(egui::vec2(28.0, 28.0))
                                    .rounding(egui::Rounding::same(4.0))
                                    .fill(al(SURFACE, 0.5))
                                    .stroke(egui::Stroke::new(1.0, LINE)),
                            )
                            .clicked()
                        {
                            let _ = webbrowser::open(web_url);
                        }

                        ui.add_space(8.0);

                        // endpoint text
                        ui.label(
                            egui::RichText::new(endpoint)
                                .color(DIM)
                                .size(11.0)
                                .monospace(),
                        );
                    });
                });
            });
    }
}

// ═══════════════════  settings window  ═══════════════════

impl LauncherApp {
    fn settings_window(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            ui.label(
                egui::RichText::new("Settings")
                    .size(16.0)
                    .strong()
                    .color(TEXT),
            );
            if subtle_btn(ui, "Close").clicked() {
                self.show_settings = false;
            }
        });
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            ui.label(egui::RichText::new("Root").color(DIM).size(13.0));
            let mut txt = self.settings.project_root.display().to_string();
            if ui
                .add(
                    egui::TextEdit::singleline(&mut txt).desired_width(ui.available_width() - 40.0),
                )
                .changed()
            {
                self.settings.project_root = PathBuf::from(&txt);
                save_settings(&self.settings);
            }
            if subtle_btn(ui, "Browse").clicked() {
                if let Some(f) = rfd::FileDialog::new()
                    .set_directory(&self.settings.project_root)
                    .pick_folder()
                {
                    self.settings.project_root = f;
                    save_settings(&self.settings);
                }
            }
        });
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.label(egui::RichText::new("Bind").color(DIM).size(13.0));
            if ui
                .add(egui::TextEdit::singleline(&mut self.settings.bind_addr).desired_width(100.0))
                .changed()
            {
                save_settings(&self.settings);
            }
            ui.add_space(16.0);
            ui.label(egui::RichText::new("Port").color(DIM).size(13.0));
            let mut p = self.settings.demo_port as i32;
            if ui
                .add(egui::DragValue::new(&mut p).range(1024..=65535))
                .changed()
            {
                self.settings.demo_port = p as u16;
                save_settings(&self.settings);
            }
        });
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            let mut a = self.settings.autostart_server;
            if ui.checkbox(&mut a, "Auto server").changed() {
                self.settings.autostart_server = a;
                save_settings(&self.settings);
            }
            let mut b = self.settings.autostart_demo;
            if ui.checkbox(&mut b, "Auto demo").changed() {
                self.settings.autostart_demo = b;
                save_settings(&self.settings);
            }
            let mut c = self.settings.open_browser_on_start;
            if ui.checkbox(&mut c, "Open browser").changed() {
                self.settings.open_browser_on_start = c;
                save_settings(&self.settings);
            }
        });
    }
}

// ═══════════════════  main  ═══════════════════

fn main() -> eframe::Result<()> {
    let v = egui::ViewportBuilder::default()
        .with_title("Playlink Launcher")
        .with_inner_size([780.0, 440.0])
        .with_min_inner_size([640.0, 380.0]);

    eframe::run_native(
        "Playlink Launcher",
        eframe::NativeOptions {
            viewport: v,
            ..Default::default()
        },
        Box::new(|cc| {
            cc.egui_ctx.set_style(style());
            Ok(Box::new(LauncherApp::new()))
        }),
    )
}
