use crate::api::{self, SpriteInfo};
use crate::config::GlobalConfig;
use crate::error::{CsError, Result};
use crate::output;
use console::{style, Key, Term};
use std::io::Write;

/// Interactive sprite picker with arrow key navigation.
pub fn pick_sprite(config: &GlobalConfig) -> Result<String> {
    let sprites = api::list_sprites(config)?;

    if sprites.is_empty() {
        return Err(CsError::user("No sprites found. Create one with: cs create <name>"));
    }

    let mut term = Term::stderr();
    let mut selected: usize = 0;
    let create_idx = sprites.len(); // virtual index for "+ create"

    loop {
        // Clear and redraw
        render_picker(&mut term, &sprites, selected)?;

        match term.read_key()? {
            Key::ArrowUp | Key::Char('k') => {
                if selected > 0 {
                    selected -= 1;
                } else {
                    selected = create_idx;
                }
            }
            Key::ArrowDown | Key::Char('j') => {
                if selected < create_idx {
                    selected += 1;
                } else {
                    selected = 0;
                }
            }
            Key::Enter => {
                // Clear the picker display
                let total_lines = sprites.len() + 7; // header + items + create + footer + padding
                for _ in 0..total_lines {
                    term.clear_line()?;
                    term.move_cursor_up(1)?;
                }
                term.clear_line()?;

                if selected == create_idx {
                    return create_sprite_interactive(config);
                }
                return Ok(sprites[selected].name.clone());
            }
            Key::Char('q') | Key::Escape => {
                return Err(CsError::user("Cancelled."));
            }
            Key::Char('+') | Key::Char('n') => {
                let total_lines = sprites.len() + 7;
                for _ in 0..total_lines {
                    term.clear_line()?;
                    term.move_cursor_up(1)?;
                }
                term.clear_line()?;
                return create_sprite_interactive(config);
            }
            Key::Char(c) if c.is_ascii_digit() => {
                let idx = c.to_digit(10).unwrap_or(0) as usize;
                if idx >= 1 && idx <= sprites.len() {
                    let total_lines = sprites.len() + 7;
                    for _ in 0..total_lines {
                        term.clear_line()?;
                        term.move_cursor_up(1)?;
                    }
                    term.clear_line()?;
                    return Ok(sprites[idx - 1].name.clone());
                }
            }
            _ => {}
        }
    }
}

fn render_picker(term: &mut Term, sprites: &[SpriteInfo], selected: usize) -> Result<()> {
    let width = 58;
    let create_idx = sprites.len();

    // Move cursor to start (clear previous render)
    let total_lines = sprites.len() + 7;
    // On first render this overshoots but that's fine — it just clears empty lines
    for _ in 0..total_lines {
        let _ = term.move_cursor_up(1);
        term.clear_line()?;
    }

    // ╭─ sprites ─────────────────────────────────╮
    let title = " sprites ";
    let rest = width - title.len() - 3;
    term.write_line(&format!(
        "  {}{}{}{}{}",
        style("╭─").dim(),
        style(title).bold(),
        style("─".repeat(rest)).dim(),
        style("─").dim(),
        style("╮").dim(),
    ))?;

    // Empty line
    term.write_line(&format!(
        "  {}{}{}",
        style("│").dim(),
        " ".repeat(width - 2),
        style("│").dim(),
    ))?;

    for (i, s) in sprites.iter().enumerate() {
        let status = output::format_status(&s.status, &s.last_active_at, &s.last_started_at);
        let is_selected = i == selected;

        let pointer = if is_selected {
            format!("{}", style("❯").cyan().bold())
        } else {
            " ".to_string()
        };

        let name_styled = if is_selected {
            format!("{}", style(&s.name).bold())
        } else {
            s.name.clone()
        };

        // Calculate padding: "  │  ❯  name      ● running   up 2h   │"
        let name_width: usize = 18;
        let status_width: usize = 10;
        let name_pad = name_width.saturating_sub(console::measure_text_width(&s.name));
        let label_pad = status_width.saturating_sub(console::measure_text_width(&status.label));

        let line_content = format!(
            " {} {}{}{} {}{}  {}",
            pointer,
            name_styled,
            " ".repeat(name_pad),
            status.icon,
            status.label,
            " ".repeat(label_pad),
            status.time_str,
        );

        let visible_len = console::measure_text_width(&line_content);
        let right_pad = (width - 2).saturating_sub(visible_len);

        term.write_line(&format!(
            "  {}{}{}{}",
            style("│").dim(),
            line_content,
            " ".repeat(right_pad),
            style("│").dim(),
        ))?;
    }

    // Separator
    term.write_line(&format!(
        "  {}{}{}",
        style("├").dim(),
        style("─".repeat(width - 2)).dim(),
        style("┤").dim(),
    ))?;

    // Create option
    let is_create_selected = selected == create_idx;
    let pointer = if is_create_selected {
        format!("{}", style("❯").cyan().bold())
    } else {
        " ".to_string()
    };
    let create_label = if is_create_selected {
        format!("{}", style("+ create new sprite").cyan().bold())
    } else {
        format!("{}", style("+ create new sprite").cyan())
    };
    let create_content = format!(" {} {}", pointer, create_label);
    let visible_len = console::measure_text_width(&create_content);
    let right_pad = (width - 2).saturating_sub(visible_len);

    term.write_line(&format!(
        "  {}{}{}{}",
        style("│").dim(),
        create_content,
        " ".repeat(right_pad),
        style("│").dim(),
    ))?;

    // Footer
    term.write_line(&format!(
        "  {}{}{}",
        style("╰").dim(),
        style("─".repeat(width - 2)).dim(),
        style("╯").dim(),
    ))?;

    // Hint line
    term.write_line(&format!(
        "    {}",
        style("↑↓ navigate  enter select  q quit").dim(),
    ))?;

    Ok(())
}

fn create_sprite_interactive(config: &GlobalConfig) -> Result<String> {
    let mut term = Term::stderr();
    eprintln!();
    write!(
        term,
        "  {} ",
        style("Sprite name:").bold()
    )?;
    term.flush()?;
    let name = term.read_line()?;
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(CsError::user("Sprite name required."));
    }
    output::info(&format!("Creating sprite '{name}'..."));
    crate::sprite::SpriteClient::create(&name, &config.org)?;
    output::success(&format!("Created '{name}'"));
    Ok(name)
}
