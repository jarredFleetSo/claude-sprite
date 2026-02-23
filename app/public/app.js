/* ==========================================================================
   Sprite Workspace Dashboard — Client-side status polling + terminal
   ========================================================================== */

(function () {
  "use strict";

  var POLL_INTERVAL = 10000; // 10 seconds
  var config = null;

  // -----------------------------------------------------------------------
  // Terminal
  // -----------------------------------------------------------------------

  var term = null;
  var fitAddon = null;
  var termWs = null;
  var reconnectTimer = null;
  var reconnectDelay = 1000;
  var terminalMode = null; // "local" or "remote"
  var selectedSprite = "";
  var autoReconnect = true;

  function initTerminal() {
    var container = document.getElementById("terminal");
    if (!container || typeof Terminal === "undefined") return;

    term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: "#0A0A0A",
        foreground: "#E0E0E0",
        cursor: "#10B981",
        selectionBackground: "rgba(16, 185, 129, 0.3)",
        black: "#0A0A0A",
        red: "#EF4444",
        green: "#10B981",
        yellow: "#F59E0B",
        blue: "#3B82F6",
        magenta: "#A855F7",
        cyan: "#06B6D4",
        white: "#E0E0E0",
        brightBlack: "#6B6B6B",
        brightRed: "#F87171",
        brightGreen: "#34D399",
        brightYellow: "#FBBF24",
        brightBlue: "#60A5FA",
        brightMagenta: "#C084FC",
        brightCyan: "#22D3EE",
        brightWhite: "#FFFFFF",
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    term.onData(function (data) {
      if (termWs && termWs.readyState === WebSocket.OPEN) {
        termWs.send(new TextEncoder().encode(data));
      }
    });

    window.addEventListener("resize", function () {
      if (fitAddon) fitAddon.fit();
    });

    term.onResize(function (size) {
      if (termWs && termWs.readyState === WebSocket.OPEN) {
        termWs.send(JSON.stringify({
          type: "resize",
          cols: size.cols,
          rows: size.rows,
        }));
      }
    });

    var reconnectBtn = document.getElementById("btn-reconnect");
    if (reconnectBtn) {
      reconnectBtn.addEventListener("click", function () {
        autoReconnect = true;
        connectTerminal();
      });
    }

    var selectEl = document.getElementById("sprite-select");
    if (selectEl) {
      selectEl.addEventListener("change", function () {
        selectedSprite = selectEl.value;
        if (selectedSprite) {
          autoReconnect = true;
          term.clear();
          connectTerminal();
        }
      });
    }

    // Fetch terminal status to decide what to show
    fetchTerminalStatus();
  }

  function fetchTerminalStatus() {
    fetch("/api/terminal/status")
      .then(function (r) { return r.json(); })
      .then(function (info) {
        terminalMode = info.mode;
        var selectEl = document.getElementById("sprite-select");

        if (info.mode === "local") {
          // On sprite — hide selector, connect directly
          if (selectEl) {
            selectEl.style.display = "none";
            // Re-add the label since we hid the select
            var label = document.createElement("span");
            label.className = "terminal-toolbar-label";
            label.textContent = "terminal";
            selectEl.parentNode.insertBefore(label, selectEl);
          }
          connectTerminal();
          return;
        }

        // Remote mode — need sprite selector
        if (!info.ready) {
          if (selectEl) selectEl.style.display = "none";
          if (term) {
            term.write("\r\n\x1b[1;31m" + (info.message || "Cannot connect") + "\x1b[0m\r\n");
          }
          return;
        }

        // Populate selector with sprites from the API
        populateSpriteSelector(info.default_sprite || "");
      })
      .catch(function () {
        // Can't reach status endpoint — try connecting anyway (might be on sprite)
        connectTerminal();
      });
  }

  function populateSpriteSelector(defaultSprite) {
    fetch("/api/sprites")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sprites = data.sprites || [];
        var selectEl = document.getElementById("sprite-select");
        if (!selectEl) return;

        selectEl.innerHTML = '<option value="">select sprite...</option>';
        sprites.forEach(function (s) {
          var name = s.name || s.id;
          var status = s.status === "running" ? "" : " [" + (s.status === "warm" ? "sleeping" : s.status) + "]";
          var opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name + status;
          selectEl.appendChild(opt);
        });

        // Auto-select default or only sprite
        if (defaultSprite) {
          selectEl.value = defaultSprite;
          selectedSprite = defaultSprite;
          connectTerminal();
        } else if (sprites.length === 1) {
          selectEl.value = sprites[0].name || sprites[0].id;
          selectedSprite = selectEl.value;
          connectTerminal();
        }
      })
      .catch(function () {});
  }

  function setTermStatus(state) {
    var dot = document.getElementById("term-status-dot");
    if (!dot) return;
    dot.className = "dot" + (state === "active" ? " active" : state === "error" ? " error" : "");
  }

  function connectTerminal() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (termWs) {
      try { termWs.close(); } catch (e) {}
      termWs = null;
    }

    // In remote mode, require a sprite selection
    if (terminalMode === "remote" && !selectedSprite) {
      setTermStatus("error");
      if (term) {
        term.write("\r\n\x1b[33mSelect a sprite from the dropdown to connect.\x1b[0m\r\n");
      }
      return;
    }

    var proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    var url = proto + "//" + window.location.host + "/api/terminal";
    if (selectedSprite && terminalMode === "remote") {
      url += "?sprite=" + encodeURIComponent(selectedSprite);
    }

    setTermStatus("warning");
    termWs = new WebSocket(url);
    termWs.binaryType = "arraybuffer";

    termWs.onopen = function () {
      setTermStatus("active");
      reconnectDelay = 1000;
      if (term) {
        termWs.send(JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }));
      }
    };

    termWs.onmessage = function (ev) {
      if (term) {
        term.write(new Uint8Array(ev.data));
      }
    };

    termWs.onclose = function () {
      setTermStatus("error");
      if (autoReconnect) {
        scheduleReconnect();
      }
    };

    termWs.onerror = function () {
      setTermStatus("error");
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connectTerminal();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
  }

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

    var codeBtn = document.getElementById("btn-editor");

    var codeUp = lastServices["code-server"] && lastServices["code-server"].running;

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
  // Create workspace
  // -----------------------------------------------------------------------

  function checkTokenStatus() {
    fetch("/api/sprites/token-status")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var section = document.getElementById("create-section");
        if (section && data.configured) {
          section.style.display = "";
        }
      })
      .catch(function () {});
  }

  function doCreate() {
    var input = document.getElementById("create-name");
    var btn = document.getElementById("btn-create");
    var status = document.getElementById("create-status");
    var name = (input.value || "").trim();
    if (!name) {
      input.focus();
      return;
    }

    btn.disabled = true;
    status.innerHTML = '<span class="dot active"></span> creating...';

    fetch("/api/sprites/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          status.innerHTML = '<span class="dot active"></span> <span style="color:var(--accent)">created ' + name + '</span>';
          input.value = "";
          fetchSprites();
        } else {
          var msg = result.data.error || "failed (" + result.status + ")";
          status.innerHTML = '<span class="dot error"></span> <span style="color:var(--red)">' + msg + '</span>';
        }
        btn.disabled = false;
        setTimeout(function () { status.innerHTML = ""; }, 5000);
      })
      .catch(function () {
        status.innerHTML = '<span class="dot error"></span> <span style="color:var(--red)">network error</span>';
        btn.disabled = false;
        setTimeout(function () { status.innerHTML = ""; }, 5000);
      });
  }

  // -----------------------------------------------------------------------
  // Sprites list
  // -----------------------------------------------------------------------

  function statusMap(apiStatus) {
    if (apiStatus === "running") return { label: "running", dotClass: "active", badgeClass: "badge-running" };
    if (apiStatus === "warm")    return { label: "sleeping", dotClass: "warning", badgeClass: "badge-sleeping" };
    return { label: "stopped", dotClass: "", badgeClass: "badge-stopped" };
  }

  function spriteMeta(sprite) {
    if (sprite.status === "running" && sprite.last_started_at) {
      var diff = (Date.now() - new Date(sprite.last_started_at).getTime()) / 1000;
      if (diff < 60) return "$ uptime &lt;1m";
      if (diff < 3600) return "$ uptime " + Math.floor(diff / 60) + "m";
      var h = Math.floor(diff / 3600);
      var m = Math.floor((diff % 3600) / 60);
      return "$ uptime " + h + "h " + m + "m";
    }
    if (sprite.last_active_at) return "$ last active " + relativeTime(sprite.last_active_at);
    if (sprite.updated_at)     return "$ updated " + relativeTime(sprite.updated_at);
    return "$ created " + relativeTime(sprite.created_at);
  }

  function renderSprites(sprites) {
    var section = document.getElementById("sprites-section");
    var container = document.getElementById("sprites-container");
    var countEl = document.getElementById("sprites-count");
    if (!section || !container) return;

    if (!sprites || sprites.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "";
    if (countEl) countEl.textContent = sprites.length;
    container.innerHTML = sprites.map(function (s) {
      var st = statusMap(s.status);
      var url = s.url || "#";
      var name = s.name || s.id;
      var isRunning = s.status === "running";
      var primaryBtn = isRunning
        ? '<a class="btn-sprite-console" href="' + url + '" target="_blank">$ console</a>'
        : '<button class="btn-sprite-wake" id="wake-' + name + '" onclick="window.__startSprite(\'' + name + '\', \'' + url + '\')">wake</button>';
      return '<div class="sprite-card">' +
        '<div class="sprite-card-header">' +
          '<span class="dot ' + st.dotClass + '"></span>' +
          '<span class="sprite-name">' + name + '/</span>' +
          '<span class="sprite-badge ' + st.badgeClass + '">[' + st.label + ']</span>' +
        '</div>' +
        '<div class="sprite-meta">' + spriteMeta(s) + '</div>' +
        '<div class="sprite-actions">' +
          primaryBtn +
          '<button class="btn-sprite-destroy" onclick="window.__destroySprite(\'' + name + '\')">destroy</button>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  function fetchSprites() {
    fetch("/api/sprites")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderSprites(data.sprites || []);
      })
      .catch(function () {});
  }

  window.__destroySprite = function (name) {
    if (!confirm("Destroy sprite \"" + name + "\"? This cannot be undone.")) return;
    fetch("/api/sprites/" + encodeURIComponent(name), { method: "DELETE" })
      .then(function (r) {
        if (r.ok || r.status === 204) {
          fetchSprites();
        } else {
          return r.json().then(function (data) {
            alert("Failed to destroy: " + (data.error || r.status));
          });
        }
      })
      .catch(function () {
        alert("Network error destroying sprite");
      });
  };

  window.__startSprite = function (name, url) {
    var btn = document.getElementById("wake-" + name);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "waking...";
    }

    fetch("/api/sprites/" + encodeURIComponent(name) + "/start", { method: "POST" })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (result) {
        if (result.ok || result.status < 300) {
          if (btn) {
            btn.textContent = "starting...";
          }
          // Poll until running, then open console
          var attempts = 0;
          var pollWake = setInterval(function () {
            attempts++;
            if (attempts > 30) { // ~30s timeout
              clearInterval(pollWake);
              if (btn) {
                btn.disabled = false;
                btn.textContent = "wake";
              }
              alert("Sprite is taking too long to start. Try again.");
              return;
            }
            fetch("/api/sprites")
              .then(function (r) { return r.json(); })
              .then(function (data) {
                var sprites = data.sprites || [];
                for (var i = 0; i < sprites.length; i++) {
                  if (sprites[i].name === name && sprites[i].status === "running") {
                    clearInterval(pollWake);
                    renderSprites(sprites);
                    if (url && url !== "#") {
                      window.open(url, "_blank");
                    }
                    return;
                  }
                }
              })
              .catch(function () {});
          }, 1000);
        } else {
          var msg = result.data.error || "failed (" + result.status + ")";
          alert("Failed to wake sprite: " + msg);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "wake";
          }
        }
      })
      .catch(function () {
        alert("Network error waking sprite");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "wake";
        }
      });
  };

  // -----------------------------------------------------------------------
  // Token settings
  // -----------------------------------------------------------------------

  function updateTokenStatus(id, status) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!status.set) {
      el.textContent = "not set";
      el.className = "setting-status";
    } else {
      el.textContent = "set (" + status.source + ")";
      el.className = "setting-status status-set";
    }
  }

  function loadTokenSettings() {
    fetch("/api/settings/tokens")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        updateTokenStatus("status-anthropic", data.anthropic_key);
        updateTokenStatus("status-sprite", data.sprite_token);

        // Update placeholders to reflect current state
        var anthropicInput = document.getElementById("token-anthropic");
        var spriteInput = document.getElementById("token-sprite");
        if (anthropicInput) {
          anthropicInput.placeholder = data.anthropic_key.set
            ? "configured (" + data.anthropic_key.source + ")"
            : "sk-ant-...";
        }
        if (spriteInput) {
          spriteInput.placeholder = data.sprite_token.set
            ? "configured (" + data.sprite_token.source + ")"
            : "token...";
        }
      })
      .catch(function () {});
  }

  function saveTokens() {
    var anthropicInput = document.getElementById("token-anthropic");
    var spriteInput = document.getElementById("token-sprite");
    var saveBtn = document.getElementById("btn-save-tokens");
    var saveStatus = document.getElementById("save-status");

    var body = {};
    var anthropicVal = (anthropicInput.value || "").trim();
    var spriteVal = (spriteInput.value || "").trim();

    if (!anthropicVal && !spriteVal) {
      saveStatus.textContent = "no changes";
      saveStatus.style.color = "var(--muted)";
      setTimeout(function () { saveStatus.textContent = ""; }, 3000);
      return;
    }

    if (anthropicVal) body.anthropic_key = anthropicVal;
    if (spriteVal) body.sprite_token = spriteVal;

    saveBtn.disabled = true;
    saveStatus.textContent = "saving...";
    saveStatus.style.color = "var(--muted)";

    fetch("/api/settings/tokens", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        saveBtn.disabled = false;
        anthropicInput.value = "";
        spriteInput.value = "";
        saveStatus.textContent = "saved";
        saveStatus.style.color = "var(--accent)";
        setTimeout(function () { saveStatus.textContent = ""; }, 3000);

        updateTokenStatus("status-anthropic", data.anthropic_key);
        updateTokenStatus("status-sprite", data.sprite_token);

        // Update placeholders
        anthropicInput.placeholder = data.anthropic_key.set
          ? "configured (" + data.anthropic_key.source + ")"
          : "sk-ant-...";
        spriteInput.placeholder = data.sprite_token.set
          ? "configured (" + data.sprite_token.source + ")"
          : "token...";

        // Re-check token status so create section shows/hides
        checkTokenStatus();
      })
      .catch(function () {
        saveBtn.disabled = false;
        saveStatus.textContent = "error";
        saveStatus.style.color = "var(--red)";
        setTimeout(function () { saveStatus.textContent = ""; }, 3000);
      });
  }

  var saveBtn = document.getElementById("btn-save-tokens");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveTokens);
  }

  var createBtn = document.getElementById("btn-create");
  if (createBtn) {
    createBtn.addEventListener("click", doCreate);
  }
  var createInput = document.getElementById("create-name");
  if (createInput) {
    createInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") doCreate();
    });
  }

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------

  touchSession();
  fetchConfig();
  fetchStatus();
  checkTokenStatus();
  loadTokenSettings();
  fetchSprites();
  initTerminal();
  setInterval(fetchStatus, POLL_INTERVAL);
  setInterval(fetchSprites, POLL_INTERVAL);
})();
