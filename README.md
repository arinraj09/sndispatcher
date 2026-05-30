# 🎯 SN Dispatcher

A Firefox extension that adds a floating widget to any ServiceNow page for **round-robin auto-assignment** of unassigned tickets — across one or multiple dispatcher groups, on a configurable timer.

---

## Features

- **Round-robin assignment** across any number of agents per group
- **Multiple dispatcher groups** — each with its own table, filter query, and agent list
- **Configurable interval** — run every 30s, 1m, 2m, 5m, or 10m
- **Pause / Resume / Stop** with mid-cycle kill switch (stops between tickets, not just between cycles)
- **Live log** with timestamps inside the widget panel
- **Session and all-time assignment counters**
- **URL → Query converter** — paste any ServiceNow list URL to auto-extract the filter
- **Import / Export** config as JSON for backup or sharing across instances
- **Draggable widget** — reposition anywhere on the page
- **SSO-compatible** — authenticates using `window.g_ck` as `X-UserToken`; no login prompts

---

## Installation

> **Signed `.xpi` releases are available in [Releases](../../releases).**  
> Download the latest `.xpi` and drag it onto `about:addons` in Firefox, or install via the Mozilla Add-ons page once listed.

### Manual / Developer Install

1. Clone or download this repo
2. Open Firefox and go to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select the `manifest.json` file from the repo root

---

## Setup

1. Open any `*.service-now.com` page — the widget appears as a small pill in the bottom-right corner
2. Click the pill to expand, then click **⚙** to open Configuration
3. Click **+ Add Group** and fill in:
   - **Group Name** — a label for this dispatcher rule
   - **Table** — e.g. `incident`, `sc_task`, `change_request`
   - **Filter Query** — the `sysparm_query` value, or paste a ServiceNow list URL into the converter and click **Add**
   - **Agents** — add each agent's display name and `sys_id` (32-char hex)
4. Back on the widget, select a group or leave on **All Active Groups**, pick an interval, and click **▶ Start**

### Finding an Agent's sys_id

Navigate to **User Administration → Users** in ServiceNow, open the agent's record, and copy the `sys_id` from the URL or the record's **Copy sys_id** right-click option.

---

## How Authentication Works

ServiceNow injects a session token (`g_ck`) into every page's JavaScript scope. Because Firefox content scripts run in an **isolated world** (separate from the page's JS), the extension uses a DOM-bridging technique: it injects a one-shot `<script>` element into the real page to read `window.g_ck` and write it to a `data-snd-gck` attribute on `<html>`, which the content script then reads. This token is sent as the `X-UserToken` header on every REST API call — the same mechanism ServiceNow's own list views use for bulk operations — so SSO sessions work without any login prompt.

---

## File Structure

```
├── manifest.json       # Extension manifest (MV2)
├── background.js       # Background script — storage relay & config tab routing
├── popup.html          # Toolbar icon popup
├── popup.js            # Popup script (separate file required by Firefox CSP)
├── widget.js           # Content script — floating widget + assignment engine
├── widget.css          # Widget styles
├── config.html         # Full configuration page
├── config.js           # Config page logic — groups, agents, import/export
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Permissions

| Permission | Reason |
|---|---|
| `tabs` | Open the config page in a new tab |
| `storage` | Persist groups, agents, and assignment counters |
| `*://*.service-now.com/*` | Inject widget and make REST API calls |
| `*://*.mercedes-benz.com/*` | Support MB-hosted ServiceNow instances |

---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss what you'd like to change.

---

## License

MIT
