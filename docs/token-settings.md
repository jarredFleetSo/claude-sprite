# Token Settings

The dashboard includes a settings section for configuring API tokens. Tokens can be set through the UI or through environment variables.

## Setting tokens via the dashboard

1. Open the dashboard (default: `http://localhost:8888`)
2. Scroll to the **settings** section below the workspace info panel
3. Paste your token into the appropriate field:
   - **anthropic key** — your Anthropic API key (starts with `sk-ant-...`)
   - **sprite token** — your Sprites.dev API token
4. Click **save**
5. A "saved" confirmation appears and the status updates to "set (file)"

Tokens are stored in `data/tokens.json`. The `data/` directory is gitignored.

## Setting tokens via environment variables

Export the variable before starting the dashboard:

```bash
SPRITE_TOKEN=your-token ./claude-sprite
```

Or add them to `/etc/default/workspace` for systemd deployments:

```
SPRITE_TOKEN="your-token"
ANTHROPIC_API_KEY="sk-ant-your-key"
```

Environment variables always take priority over file-stored tokens. When an env var is active, the dashboard shows "set (env)" for that token.

## Status indicators

Each token field shows its current state:

| Status | Meaning |
|--------|---------|
| **not set** | No token configured from any source |
| **set (file)** | Token was saved via the dashboard UI |
| **set (env)** | Token is provided by an environment variable |

## Creating a workspace

The "create" section only appears when a sprite token is configured. After saving a sprite token through settings, the create form appears automatically — no reload needed.

## Clearing a token

To clear a file-stored token, use the API directly:

```bash
curl -X PUT http://localhost:8888/api/settings/tokens \
  -H 'Content-Type: application/json' \
  -d '{"sprite_token": ""}'
```

## API reference

**GET /api/settings/tokens** — returns token status (never exposes values):

```json
{
  "sprite_token": {"set": true, "source": "env"},
  "anthropic_key": {"set": false, "source": "none"}
}
```

**PUT /api/settings/tokens** — update one or both tokens:

```bash
curl -X PUT http://localhost:8888/api/settings/tokens \
  -H 'Content-Type: application/json' \
  -d '{"anthropic_key": "sk-ant-..."}'
```

Only keys present in the request body are updated. Omitted keys are left unchanged.
