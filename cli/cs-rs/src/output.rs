use console::{style, Style, Term};
use std::fmt;
use std::sync::LazyLock;

// ── Design tokens ──────────────────────────────────────────────────────────

pub static GREEN: LazyLock<Style> = LazyLock::new(|| Style::new().green());
pub static YELLOW: LazyLock<Style> = LazyLock::new(|| Style::new().yellow());
pub static RED: LazyLock<Style> = LazyLock::new(|| Style::new().red());
pub static CYAN: LazyLock<Style> = LazyLock::new(|| Style::new().cyan());
pub static MAGENTA: LazyLock<Style> = LazyLock::new(|| Style::new().magenta());
pub static BOLD: LazyLock<Style> = LazyLock::new(|| Style::new().bold());
pub static DIM: LazyLock<Style> = LazyLock::new(|| Style::new().dim());
pub static BOLD_GREEN: LazyLock<Style> = LazyLock::new(|| Style::new().green().bold());
pub static BOLD_CYAN: LazyLock<Style> = LazyLock::new(|| Style::new().cyan().bold());
pub static BOLD_RED: LazyLock<Style> = LazyLock::new(|| Style::new().red().bold());
pub static BOLD_YELLOW: LazyLock<Style> = LazyLock::new(|| Style::new().yellow().bold());

// ── Box drawing ────────────────────────────────────────────────────────────

pub const BOX_TL: &str = "╭";
pub const BOX_TR: &str = "╮";
pub const BOX_BL: &str = "╰";
pub const BOX_BR: &str = "╯";
pub const BOX_H: &str = "─";
pub const BOX_V: &str = "│";
pub const BOX_T: &str = "├";
pub const BOX_CROSS: &str = "┤";

// ── Status icons ───────────────────────────────────────────────────────────

pub const ICON_RUNNING: &str = "●";
pub const ICON_SLEEPING: &str = "◐";
pub const ICON_STOPPED: &str = "○";
pub const ICON_CHECK: &str = "✓";
pub const ICON_CROSS: &str = "✗";
pub const ICON_ARROW: &str = "→";
pub const ICON_DISPATCH: &str = "⚡";
pub const ICON_SYNC: &str = "↑";
pub const ICON_PULL: &str = "↓";

// ── Message functions ──────────────────────────────────────────────────────

pub fn info(msg: &str) {
    eprintln!("  {} {}", style("▸").green().bold(), msg);
}

pub fn step(num: u8, total: u8, msg: &str) {
    eprintln!(
        "  {} {}",
        style(format!("[{num}/{total}]")).cyan().bold(),
        msg
    );
}

pub fn success(msg: &str) {
    eprintln!("  {} {}", style("✓").green().bold(), style(msg).green());
}

pub fn warn(msg: &str) {
    eprintln!("  {} {}", style("▸").yellow().bold(), style(msg).yellow());
}

pub fn err(msg: &str) {
    eprintln!("  {} {}", style("✗").red().bold(), style(msg).red());
}

pub fn hint(label: &str, cmd: &str) {
    eprintln!(
        "    {} {}",
        style(format!("{label}:")).dim(),
        style(cmd).cyan()
    );
}

pub fn dim(msg: &str) {
    eprintln!("  {}", style(msg).dim());
}

// ── Banner / header ────────────────────────────────────────────────────────

pub fn header(title: &str) {
    let term_width = Term::stderr().size().1 as usize;
    let width = term_width.min(72);
    let pad = width.saturating_sub(title.len() + 4);
    eprintln!();
    eprintln!(
        "  {}{} {} {}{}",
        style(BOX_TL).dim(),
        style(BOX_H.repeat(1)).dim(),
        style(title).bold(),
        style(BOX_H.repeat(pad)).dim(),
        style(BOX_TR).dim(),
    );
}

pub fn footer() {
    let term_width = Term::stderr().size().1 as usize;
    let width = term_width.min(72);
    eprintln!(
        "  {}{}{}",
        style(BOX_BL).dim(),
        style(BOX_H.repeat(width - 2)).dim(),
        style(BOX_BR).dim(),
    );
    eprintln!();
}

pub fn divider() {
    let term_width = Term::stderr().size().1 as usize;
    let width = term_width.min(72);
    eprintln!(
        "  {}{}{}",
        style(BOX_T).dim(),
        style(BOX_H.repeat(width - 2)).dim(),
        style(BOX_CROSS).dim(),
    );
}

pub fn boxline(msg: &str) {
    let term_width = Term::stderr().size().1 as usize;
    let width = term_width.min(72);
    // Strip ANSI for length calculation
    let visible_len = console::measure_text_width(msg);
    let pad = width.saturating_sub(visible_len + 5);
    eprintln!(
        "  {} {} {}{}",
        style(BOX_V).dim(),
        msg,
        " ".repeat(pad),
        style(BOX_V).dim(),
    );
}

pub fn boxline_empty() {
    let term_width = Term::stderr().size().1 as usize;
    let width = term_width.min(72);
    eprintln!(
        "  {} {}{}",
        style(BOX_V).dim(),
        " ".repeat(width - 4),
        style(BOX_V).dim(),
    );
}

// ── Sprite status formatting ───────────────────────────────────────────────

pub struct SpriteStatus {
    pub icon: String,
    pub label: String,
    pub time_str: String,
}

pub fn format_status(status: &str, last_active: &str, last_started: &str) -> SpriteStatus {
    match status {
        "running" | "active" | "warm" => {
            let time = crate::api::format_relative_time(last_started);
            let time_str = if time == "—" {
                String::new()
            } else {
                format!("{}", style(format!("up {time}")).dim())
            };
            SpriteStatus {
                icon: format!("{}", style(ICON_RUNNING).green()),
                label: format!("{}", style("running").green()),
                time_str,
            }
        }
        "sleeping" | "suspended" | "hibernating" => {
            let time = crate::api::format_relative_time(last_active);
            let time_str = if time == "—" {
                String::new()
            } else {
                format!("{}", style(format!("{time} ago")).dim())
            };
            SpriteStatus {
                icon: format!("{}", style(ICON_SLEEPING).yellow()),
                label: format!("{}", style("sleeping").yellow()),
                time_str,
            }
        }
        _ => {
            let time = crate::api::format_relative_time(last_active);
            let time_str = if time == "—" {
                String::new()
            } else {
                format!("{}", style(format!("{time} ago")).dim())
            };
            SpriteStatus {
                icon: format!("{}", style(ICON_STOPPED).dim()),
                label: format!("{}", style(status).dim()),
                time_str,
            }
        }
    }
}

// ── Key-value display ──────────────────────────────────────────────────────

pub fn kv(key: &str, value: impl fmt::Display) {
    eprintln!(
        "  {} {} {}",
        style(BOX_V).dim(),
        style(format!("{key:>14}")).dim(),
        value,
    );
}
