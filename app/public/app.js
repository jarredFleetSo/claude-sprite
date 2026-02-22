/* ==========================================================================
   Sprite Workspace Dashboard — Client-side status polling
   ========================================================================== */

(function () {
  "use strict";

  var POLL_INTERVAL = 10000; // 10 seconds
  var config = null;

  // -----------------------------------------------------------------------
  // URL construction
  // -----------------------------------------------------------------------

  /**
   * Build a service URL based on the current access method:
   *   - Tunnel: use the configured hostname (e.g., term.example.com)
   *   - Proxy / direct: same host, different port
   */
  function getServiceUrl(port, tunnelHostname) {
    // If we have a tunnel hostname and we're accessed via HTTPS, use it
    if (tunnelHostname && window.location.protocol === "https:") {
      return "https://" + tunnelHostname;
    }
    // Otherwise, same host with the service port (proxy or direct)
    return window.location.protocol + "//" + window.location.hostname + ":" + port;
  }

  // -----------------------------------------------------------------------
  // DOM updates
  // -----------------------------------------------------------------------

  function updateDot(id, running) {
    var dot = document.getElementById(id);
    if (!dot) return;
    dot.className = "dot" + (running ? " active" : "");
  }

  function updateStatus(data) {
    // Hostname
    var el = document.getElementById("hostname");
    if (el) el.textContent = data.hostname || "unknown";

    // Service dots
    var svc = data.services || {};
    lastServices = svc;
    updateDot("dot-ttyd", svc.ttyd && svc.ttyd.running);
    updateDot("dot-code", svc["code-server"] && svc["code-server"].running);
    updateDot("dot-dash", svc.dashboard && svc.dashboard.running);

    // Update button enabled/disabled state based on service health
    updateButtons();

    // tmux info
    var tmux = data.tmux || [];
    var tmuxEl = document.getElementById("tmux-info");
    if (tmuxEl) {
      if (tmux.length === 0) {
        tmuxEl.textContent = "no sessions";
      } else {
        tmuxEl.textContent = tmux
          .map(function (s) {
            return s.name + " (" + s.windows + "w" + (s.attached ? ", attached" : "") + ")";
          })
          .join(", ");
      }
    }

    // Uptime
    var uptimeEl = document.getElementById("uptime-info");
    if (uptimeEl) uptimeEl.textContent = data.uptime || "—";

    // Session info
    if (data.sessions) updateSessionInfo(data.sessions);

    // Last updated
    var ts = document.getElementById("last-update");
    if (ts) ts.textContent = "updated " + new Date().toLocaleTimeString();
  }

  var lastServices = {};

  function updateButtons() {
    if (!config) return;
    var ports = config.ports || {};
    var hosts = config.hostnames || {};

    var termBtn = document.getElementById("btn-terminal");
    var codeBtn = document.getElementById("btn-editor");

    var ttydUp = lastServices.ttyd && lastServices.ttyd.running;
    var codeUp = lastServices["code-server"] && lastServices["code-server"].running;

    if (termBtn) {
      termBtn.href = ttydUp ? getServiceUrl(ports.ttyd || 7681, hosts.term) : "#";
      termBtn.className = "btn btn-primary" + (ttydUp ? "" : " btn-disabled");
    }
    if (codeBtn) {
      codeBtn.href = codeUp ? getServiceUrl(ports.code_server || 8080, hosts.code) : "#";
      codeBtn.className = "btn btn-secondary" + (codeUp ? "" : " btn-disabled");
    }
  }

  // -----------------------------------------------------------------------
  // Session tracking
  // -----------------------------------------------------------------------

  function relativeTime(isoString) {
    if (!isoString) return "—";
    var diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }

  function updateSessionInfo(sessions) {
    // Show info for the "workspace" session (or first available)
    var session = sessions.workspace;
    if (!session) {
      var keys = Object.keys(sessions);
      if (keys.length > 0) session = sessions[keys[0]];
    }

    var stateEl = document.getElementById("session-state-info");
    var seenEl = document.getElementById("last-seen-info");
    var clientEl = document.getElementById("last-client-info");
    if (session) {
      if (stateEl) {
        var state = session.state || "idle";
        stateEl.innerHTML = '<span class="badge badge-' + state + '">' + state + '</span>';
      }
      if (seenEl) seenEl.textContent = relativeTime(session.last_accessed_at);
      if (clientEl) clientEl.textContent = session.last_client || "—";
    }
  }

  function touchSession() {
    fetch("/api/sessions/workspace/touch", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "client=dashboard",
    }).catch(function () {}); // best-effort
  }

  // -----------------------------------------------------------------------
  // Polling
  // -----------------------------------------------------------------------

  function fetchStatus() {
    fetch("/api/status")
      .then(function (r) { return r.json(); })
      .then(updateStatus)
      .catch(function () {
        var el = document.getElementById("hostname");
        if (el) el.textContent = "connection lost";
      });
  }

  function fetchConfig() {
    fetch("/api/config")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        config = data;
        updateButtons();
      })
      .catch(function () {}); // config is optional
  }

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------

  touchSession();
  fetchConfig();
  fetchStatus();
  setInterval(fetchStatus, POLL_INTERVAL);
})();
