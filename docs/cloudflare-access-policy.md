# Cloudflare Access Policy Setup

Step-by-step guide for setting up Cloudflare Tunnel and Access policies for the Remote Claude Code Workspace.

---

## Prerequisites

- A Cloudflare account (free tier works)
- A domain managed by Cloudflare (DNS hosted on Cloudflare)
- Cloudflare Zero Trust enabled (free plan includes up to 50 users)
  - Enable at: https://one.dash.cloudflare.com

---

## Step 1: Create a Cloudflare Tunnel

A tunnel establishes an outbound-only connection from your Sprite VM to Cloudflare's edge. No inbound firewall rules or port forwarding required.

### Option A: Via Dashboard (Recommended for First Setup)

1. Go to https://one.dash.cloudflare.com
2. Navigate to **Networks** > **Tunnels**
3. Click **Create a tunnel**
4. Choose **Cloudflared** as the connector type
5. Name the tunnel (e.g., `claude-workspace` or your workspace name)
6. Click **Save tunnel**
7. Copy the **tunnel token** -- you will need this for `workspace.env`

The token looks like:

```
eyJhIjoiNjM...long-base64-string...
```

### Option B: Via CLI

If you have `cloudflared` installed locally:

```bash
# Authenticate with Cloudflare (opens browser)
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create claude-workspace

# The tunnel ID and credentials file will be printed.
# For token mode (used by this workspace), get the token from the dashboard.
```

### Save the Token

Add the tunnel token to your workspace configuration:

```bash
# In config/workspace.env
CLOUDFLARE_TUNNEL_TOKEN="eyJhIjoiNjM..."
```

---

## Step 2: Configure Public Hostnames

Each service running on the Sprite VM needs a public hostname routed through the tunnel.

### Via Dashboard

1. In the tunnel configuration page, go to the **Public Hostname** tab
2. Add three hostnames:

**Hostname 1: code-server (Browser IDE)**
| Field     | Value                  |
|-----------|------------------------|
| Subdomain | `code`                 |
| Domain    | `yourdomain.com`       |
| Type      | HTTP                   |
| URL       | `localhost:8080`       |

**Hostname 2: ttyd (Browser Terminal)**
| Field     | Value                  |
|-----------|------------------------|
| Subdomain | `term`                 |
| Domain    | `yourdomain.com`       |
| Type      | HTTP                   |
| URL       | `localhost:7681`       |

**Hostname 3: App Preview**
| Field     | Value                  |
|-----------|------------------------|
| Subdomain | `preview`              |
| Domain    | `yourdomain.com`       |
| Type      | HTTP                   |
| URL       | `localhost:3000`       |

For each hostname, under **Additional application settings** > **TLS**, enable **No TLS Verify** if your local services use plain HTTP.

### Via Config File

If using config-file mode instead of token mode, the tunnel configuration is rendered from `config/cloudflared/config.yml.template`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/coder/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: code.yourdomain.com
    service: http://localhost:8080
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: term.yourdomain.com
    service: http://localhost:7681
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: preview.yourdomain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - service: http_status:404
```

---

## Step 3: Create Access Applications

Cloudflare Access protects each hostname with authentication. Create an Access Application for each service.

### Via Dashboard

1. Go to https://one.dash.cloudflare.com
2. Navigate to **Access** > **Applications**
3. Click **Add an application**
4. Choose **Self-hosted**

**Application 1: code-server**
| Field              | Value                          |
|--------------------|--------------------------------|
| Application name   | Workspace - Code Editor        |
| Session duration   | 24 hours                       |
| Application domain | `code.yourdomain.com`          |

**Application 2: ttyd**
| Field              | Value                          |
|--------------------|--------------------------------|
| Application name   | Workspace - Terminal           |
| Session duration   | 24 hours                       |
| Application domain | `term.yourdomain.com`          |

**Application 3: App Preview**
| Field              | Value                          |
|--------------------|--------------------------------|
| Application name   | Workspace - Preview            |
| Session duration   | 24 hours                       |
| Application domain | `preview.yourdomain.com`       |

The 24-hour session duration means you authenticate once and have access for the full day across devices.

---

## Step 4: Create Access Policies

For each Access Application, create a policy that defines who is allowed access.

### Via Dashboard

Within each application created above:

1. Click **Add a policy**
2. Configure as follows:

| Field        | Value                                       |
|--------------|---------------------------------------------|
| Policy name  | Workspace Owner                             |
| Action       | Allow                                       |
| Include rule | Emails - `your@email.com`                   |

### Alternative Policy Options

**Allow by email domain** (useful for team access):
- Include rule: Email Domain - `yourdomain.com`

**Allow by Identity Provider group** (enterprise):
- Include rule: IdP Groups - `Engineering Team`

**Allow multiple specific users**:
- Include rule: Emails - `alice@example.com`, `bob@example.com`

### Deny-by-Default

Cloudflare Access is deny-by-default. If no policy matches, the request is blocked. You only need to define Allow policies for authorized users.

---

## API Examples

For automation or scripting, you can create tunnels and access policies via the Cloudflare API.

### Prerequisites

```bash
# Set your API credentials
export CF_API_TOKEN="your-api-token"
export CF_ACCOUNT_ID="your-account-id"
```

You can create an API token at https://dash.cloudflare.com/profile/api-tokens with the following permissions:
- Account > Cloudflare Tunnel > Edit
- Account > Access: Apps and Policies > Edit

### Create a Tunnel

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/cfd_tunnel" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "claude-workspace",
    "tunnel_secret": "'$(openssl rand -base64 32)'"
  }'
```

The response includes the tunnel ID and token.

### Create an Access Application

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access/apps" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Workspace - Code Editor",
    "domain": "code.yourdomain.com",
    "type": "self_hosted",
    "session_duration": "24h",
    "auto_redirect_to_identity": true
  }'
```

Save the `id` from the response for the next step.

### Create an Access Policy

```bash
# Replace <APP_ID> with the application ID from the previous step
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access/apps/<APP_ID>/policies" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Workspace Owner",
    "decision": "allow",
    "include": [
      {
        "email": {
          "email": "your@email.com"
        }
      }
    ]
  }'
```

### List Existing Tunnels

```bash
curl -X GET "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/cfd_tunnel" \
  -H "Authorization: Bearer ${CF_API_TOKEN}"
```

---

## DNS Records

Cloudflare Tunnel **automatically creates CNAME records** for each public hostname you configure. You do not need to manually add DNS records.

When you add a public hostname (e.g., `code.yourdomain.com`) to your tunnel configuration, Cloudflare creates a CNAME record pointing to:

```
<TUNNEL_ID>.cfargotunnel.com
```

You can verify this in your Cloudflare DNS dashboard. The records will appear with a "Tunnel" indicator.

### Important Notes

- The domain must be on Cloudflare (nameservers pointing to Cloudflare)
- CNAME records are created automatically when hostnames are added via the dashboard
- If using config-file mode, you may need to manually route DNS: `cloudflared tunnel route dns <TUNNEL_NAME> <HOSTNAME>`
- DNS propagation is typically instant since Cloudflare controls the authoritative DNS

---

## Verification

After completing the setup, verify each hostname:

1. Open `https://code.yourdomain.com` in a browser -- you should see the Cloudflare Access login page
2. Authenticate with your configured email/IdP
3. After authentication, code-server should load
4. Repeat for `https://term.yourdomain.com` and `https://preview.yourdomain.com`

If authentication was already completed for one hostname, the session cookie may carry over depending on your domain and cookie scope configuration.
