use crate::error::{CsError, Result};
use crate::output;
use crate::sprite::SpriteClient;
use console::Term;
use std::io::Write;

/// Push Anthropic API key to sprite and ensure onboarding is complete
pub fn push_api_key(client: &SpriteClient, force: bool) -> Result<()> {
    // Check if already authenticated
    let has_key = client
        .exec(&["bash", "-l", "-c", "echo \"$ANTHROPIC_API_KEY\""])
        .ok()
        .and_then(|o| {
            let key = o.stdout.trim().to_string();
            if key.is_empty() { None } else { Some(key) }
        });

    if let Some(ref existing_key) = has_key {
        if !force {
            let masked = format!(
                "{}...{}",
                &existing_key[..existing_key.len().min(10)],
                &existing_key[existing_key.len().saturating_sub(4)..]
            );
            output::info(&format!(
                "API key already set on {} ({masked})",
                client.name
            ));

            let mut term = Term::stderr();
            write!(term, "Replace it? [y/N] ")?;
            term.flush()?;
            let answer = term.read_line()?;
            if !matches!(answer.trim(), "y" | "Y") {
                return Ok(());
            }
        }
    }

    let mut term = Term::stderr();
    write!(term, "Anthropic API key: ")?;
    term.flush()?;
    let api_key = term.read_secure_line()?;

    if api_key.is_empty() {
        return Err(CsError::user(
            "API key required. Get one at https://console.anthropic.com/settings/keys",
        ));
    }

    output::info(&format!("Pushing API key to {}...", client.name));

    // 1. Write key to env file
    let script = r#"
echo "export ANTHROPIC_API_KEY=\"$API_KEY\"" > ~/.claude_env
chmod 600 ~/.claude_env
if ! grep -qF '.claude_env' ~/.bashrc 2>/dev/null; then
    echo '' >> ~/.bashrc
    echo '# Claude Code API key' >> ~/.bashrc
    echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.bashrc
fi
if ! grep -qF '.claude_env' ~/.profile 2>/dev/null; then
    echo '' >> ~/.profile
    echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.profile
fi
"#;
    client.exec_script(script, &[("API_KEY", &api_key)])?;

    // 2. Bootstrap onboarding — try jq > node > python3 > sed
    let onboarding_script = r#"
export ANTHROPIC_API_KEY="$API_KEY"
# Quick non-interactive call to bootstrap .claude.json
echo hi | claude 2>/dev/null || true

config="$HOME/.claude.json"
[ ! -f "$config" ] && echo '{"hasCompletedOnboarding":true,"lastOnboardingVersion":"99.0.0"}' > "$config" && exit 0

if command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp)
    jq '.hasCompletedOnboarding=true | .lastOnboardingVersion="99.0.0" | if .projects then .projects |= with_entries(.value.hasTrustDialogAccepted=true) else . end' "$config" > "$tmp" 2>/dev/null && mv "$tmp" "$config" && exit 0
    rm -f "$tmp"
fi

if command -v node >/dev/null 2>&1; then
    node -e "
const fs=require('fs'); const p=process.env.HOME+'/.claude.json';
let d={}; try{d=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){}
d.hasCompletedOnboarding=true; d.lastOnboardingVersion='99.0.0';
if(d.projects){for(const k of Object.keys(d.projects)){d.projects[k].hasTrustDialogAccepted=true}}
fs.writeFileSync(p,JSON.stringify(d,null,2));
" && exit 0
fi

if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json,os
path=os.path.expanduser('~/.claude.json')
data={}
if os.path.exists(path):
    with open(path) as f: data=json.load(f)
data['hasCompletedOnboarding']=True
data['lastOnboardingVersion']='99.0.0'
for proj in data.get('projects',{}):
    data['projects'][proj]['hasTrustDialogAccepted']=True
with open(path,'w') as f: json.dump(data,f,indent=2)
" && exit 0
fi

# sed fallback (doesn't handle projects trust dialogs)
tmp=$(mktemp)
sed -e 's/"hasCompletedOnboarding":\s*false/"hasCompletedOnboarding": true/g' "$config" > "$tmp"
if ! grep -q '"hasCompletedOnboarding"' "$tmp"; then
    sed -i 's/^{/{"hasCompletedOnboarding":true,"lastOnboardingVersion":"99.0.0",/' "$tmp"
fi
mv "$tmp" "$config"
"#;
    match client.exec_script(onboarding_script, &[("API_KEY", &api_key)]) {
        Ok(_) => {}
        Err(_) => output::warn("Failed to set onboarding flags (non-fatal)"),
    }

    output::info(&format!("Done. Claude Code is ready on {}.", client.name));
    Ok(())
}

/// Check if API key is already configured, prompt and push if not
/// Returns true if key is available (existing or newly pushed)
pub fn ensure_api_key(client: &SpriteClient) -> Result<bool> {
    let has_key = client
        .exec(&[
            "bash",
            "-c",
            "[ -f ~/.claude_env ] && grep -q ANTHROPIC_API_KEY ~/.claude_env && echo yes",
        ])
        .ok()
        .map(|o| o.stdout.trim() == "yes")
        .unwrap_or(false);

    if has_key {
        return Ok(true);
    }

    output::warn(&format!(
        "No Anthropic API key found on {}.",
        client.name
    ));

    let mut term = Term::stderr();
    write!(term, "  Anthropic API key: ")?;
    term.flush()?;
    let api_key = term.read_secure_line()?;
    eprintln!();

    if api_key.is_empty() {
        output::warn("Skipped — Claude won't be able to authenticate without an API key.");
        return Ok(false);
    }

    let script = r#"
echo "export ANTHROPIC_API_KEY=\"$API_KEY\"" > ~/.claude_env
chmod 600 ~/.claude_env
if ! grep -qF '.claude_env' ~/.bashrc 2>/dev/null; then
    echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.bashrc
fi
if ! grep -qF '.claude_env' ~/.profile 2>/dev/null; then
    echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.profile
fi
"#;
    client.exec_script(script, &[("API_KEY", &api_key)])?;
    output::info(&format!("API key saved on {}.", client.name));

    Ok(true)
}
