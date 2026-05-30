'use strict';

// ── Guard: inject only once ───────────────────────────────────────────────────
if (document.getElementById('snd-widget')) {
  // already injected (e.g. SPA navigation re-ran content script)
  // just send a reload
  browser.runtime.sendMessage({ type: 'RELOAD_STATE' });
  // skip rest
} else {

// ── State ─────────────────────────────────────────────────────────────────────
let groups          = [];
let engineState     = 'stopped';  // stopped | running | paused
let countdownId     = null;
let remainingMs     = 0;
let intervalSecs    = 60;
let sessionAssigned = 0;
let totalAssigned   = 0;
let cyclesRun       = 0;
let activeGroupId   = null;       // null = all groups
let panelOpen       = false;

// ── Build widget HTML ─────────────────────────────────────────────────────────
const host = document.createElement('div');
host.id = 'snd-widget';
host.innerHTML = `
  <!-- Collapsed pill -->
  <div id="snd-pill">
    <div id="snd-pill-dot"></div>
    <div id="snd-pill-label">SN Dispatcher <span>Stopped</span></div>
    <div id="snd-pill-countdown"></div>
  </div>

  <!-- Expanded panel -->
  <div id="snd-panel">
    <div id="snd-panel-header">
      <div id="snd-panel-title">
        <div id="snd-panel-dot"></div>
        <div>
          <div id="snd-panel-name">SN Dispatcher</div>
          <div id="snd-panel-status">Stopped · 0 groups loaded</div>
        </div>
      </div>
      <button id="snd-close-btn" title="Collapse">╳</button>
    </div>

    <div id="snd-stats">
      <div class="snd-stat">
        <div class="snd-stat-val" id="snd-stat-session">0</div>
        <div class="snd-stat-lbl">Session</div>
      </div>
      <div class="snd-stat">
        <div class="snd-stat-val" id="snd-stat-total">0</div>
        <div class="snd-stat-lbl">All-time</div>
      </div>
      <div class="snd-stat">
        <div class="snd-stat-val" id="snd-stat-groups">0</div>
        <div class="snd-stat-lbl">Groups</div>
      </div>
      <div class="snd-stat">
        <div class="snd-stat-val" id="snd-stat-cycles">0</div>
        <div class="snd-stat-lbl">Cycles</div>
      </div>
    </div>

    <div id="snd-countdown-bar">
      <span id="snd-countdown-label">Next run</span>
      <div id="snd-countdown-track"><div id="snd-countdown-fill"></div></div>
      <span id="snd-countdown-val">—</span>
    </div>

    <div id="snd-group-row">
      <span id="snd-group-label">Group</span>
      <select id="snd-group-select">
        <option value="">All Active Groups</option>
      </select>
    </div>

    <div id="snd-controls">
      <button class="snd-btn snd-btn-start"  id="snd-btn-start">▶ Start</button>
      <button class="snd-btn snd-btn-pause"  id="snd-btn-pause"  style="display:none">⏸ Pause</button>
      <button class="snd-btn snd-btn-stop"   id="snd-btn-stop"   style="display:none">⏹ Stop</button>
      <button class="snd-btn snd-btn-config" id="snd-btn-config" title="Open full config">⚙</button>
    </div>

    <div id="snd-log">
      <div class="snd-log-line" style="color:#4a5568" data-placeholder>
        <span class="snd-log-msg">Waiting for engine to start...</span>
      </div>
    </div>

    <div id="snd-footer">
      <span id="snd-instance">${location.hostname}</span>
      <div id="snd-interval-wrap">
        <span id="snd-interval-label">Every</span>
        <select id="snd-interval-select">
          <option value="30">30s</option>
          <option value="60" selected>1m</option>
          <option value="120">2m</option>
          <option value="300">5m</option>
          <option value="600">10m</option>
        </select>
      </div>
    </div>
  </div>
`;
document.body.appendChild(host);

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pill            = document.getElementById('snd-pill');
const pillDot         = document.getElementById('snd-pill-dot');
const pillLabel       = document.getElementById('snd-pill-label');
const pillCountdown   = document.getElementById('snd-pill-countdown');
const panel           = document.getElementById('snd-panel');
const panelDot        = document.getElementById('snd-panel-dot');
const panelStatus     = document.getElementById('snd-panel-status');
const closeBtn        = document.getElementById('snd-close-btn');
const statSession     = document.getElementById('snd-stat-session');
const statTotal       = document.getElementById('snd-stat-total');
const statGroups      = document.getElementById('snd-stat-groups');
const statCycles      = document.getElementById('snd-stat-cycles');
const countdownFill   = document.getElementById('snd-countdown-fill');
const countdownVal    = document.getElementById('snd-countdown-val');
const groupSelect     = document.getElementById('snd-group-select');
const btnStart        = document.getElementById('snd-btn-start');
const btnPause        = document.getElementById('snd-btn-pause');
const btnStop         = document.getElementById('snd-btn-stop');
const btnConfig       = document.getElementById('snd-btn-config');
const logEl           = document.getElementById('snd-log');
const intervalSelect  = document.getElementById('snd-interval-select');

// ── Toggle panel ──────────────────────────────────────────────────────────────
function togglePanel() {
  panelOpen = !panelOpen;
  panel.classList.toggle('open', panelOpen);
  pill.style.display = panelOpen ? 'none' : 'flex';
}
pill.addEventListener('click', togglePanel);
closeBtn.addEventListener('click', togglePanel);
document.getElementById('snd-panel-header').addEventListener('click', e => {
  if (e.target === closeBtn || closeBtn.contains(e.target)) return;
  togglePanel();
});

// ── Config button ─────────────────────────────────────────────────────────────
btnConfig.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'OPEN_CONFIG' });
});

// ── Log ───────────────────────────────────────────────────────────────────────
function log(msg, color, icon) {
  const placeholder = logEl.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();

  const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const line = document.createElement('div');
  line.className = 'snd-log-line';
  line.innerHTML =
    `<span class="snd-log-time">${now}</span>` +
    `<span class="snd-log-msg" style="color:${color||'#e2e8f0'}">${icon ? icon + ' ' : ''}${msg}</span>`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  while (logEl.children.length > 80) logEl.removeChild(logEl.firstChild);
}

function logDivider(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'color:#4a5568;font-size:9px;margin:2px 0;';
  d.textContent = '─── ' + msg + ' ───';
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  statSession.textContent = sessionAssigned;
  statTotal.textContent   = totalAssigned;
  statGroups.textContent  = groups.filter(g => g.active !== false).length;
  statCycles.textContent  = cyclesRun;
}

// ── Engine state ──────────────────────────────────────────────────────────────
function setEngineState(state) {
  engineState = state;
  const dotClass = state === 'running' ? 'running' : state === 'paused' ? 'paused' : '';
  pillDot.className   = 'snd-' + (dotClass || 'stopped');  // just for reference
  pillDot.className   = dotClass ? dotClass : '';
  panelDot.className  = dotClass ? dotClass : '';

  // Re-apply id (className wipes it on the host div — use dataset trick)
  pillDot.id  = 'snd-pill-dot';
  panelDot.id = 'snd-panel-dot';

  const lbl = state === 'running' ? 'Running' : state === 'paused' ? 'Paused' : 'Stopped';
  pillLabel.innerHTML = `SN Dispatcher <span>${lbl}</span>`;
  panelStatus.textContent = lbl + ' · ' + groups.filter(g => g.active !== false).length + ' group(s)';

  btnStart.style.display = state === 'stopped' ? '' : 'none';
  btnPause.style.display = state !== 'stopped' ? '' : 'none';
  btnStop.style.display  = state !== 'stopped' ? '' : 'none';
  btnPause.textContent   = state === 'paused' ? '▶ Resume' : '⏸ Pause';

  if (state === 'stopped') {
    pillCountdown.textContent = '';
    countdownVal.textContent  = '—';
    countdownFill.style.width = '100%';
  }
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function startCountdown(onComplete) {
  intervalSecs = parseInt(intervalSelect.value) || 60;
  remainingMs  = intervalSecs * 1000;
  clearInterval(countdownId);

  countdownId = setInterval(() => {
    if (engineState === 'paused') return;
    remainingMs -= 1000;
    const secs  = Math.max(0, Math.floor(remainingMs / 1000));
    const mins  = Math.floor(secs / 60);
    const s     = secs % 60;
    const txt   = mins > 0 ? mins + ':' + (s < 10 ? '0' : '') + s : s + 's';
    countdownVal.textContent  = txt;
    pillCountdown.textContent = txt;
    countdownFill.style.width = Math.max(0, (remainingMs / (intervalSecs * 1000)) * 100) + '%';
    if (remainingMs <= 0) { clearInterval(countdownId); if (engineState !== 'stopped') onComplete(); }
  }, 1000);
}

// ── Storage helpers via background ───────────────────────────────────────────
function getRR(groupId) {
  return browser.runtime.sendMessage({ type: 'GET_RR', groupId }).then(r => r.idx);
}
function setRR(groupId, idx) {
  return browser.runtime.sendMessage({ type: 'SET_RR', groupId, idx });
}
function saveState() {
  return browser.runtime.sendMessage({
    type: 'SAVE_STATE',
    groups,
    stats: { totalAssigned, cyclesRun }
  });
}

// ── XHR helpers — running directly in this page context ──────────────────────

// Firefox content scripts run in an ISOLATED world — window.g_ck set by the
// SN page scripts is NOT visible here. We must inject a <script> tag into the
// real page DOM to read g_ck and write it onto a known DOM attribute, then
// read it back from the content-script side.
function getSnToken() {
  // 1. Check if a previous injection already stored the token
  const cached = document.documentElement.getAttribute('data-snd-gck');
  if (cached) return cached;

  // 2. Inject a one-shot <script> that runs in the page's JS world
  try {
    const s = document.createElement('script');
    s.textContent = `(function(){
      var t = window.g_ck
        || (window.NOW && window.NOW.user && window.NOW.user.userToken)
        || (window.top && window.top !== window && window.top.g_ck)
        || '';
      if (t) document.documentElement.setAttribute('data-snd-gck', t);
    })();`;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  } catch(e) { /* CSP may block — fall through */ }

  // 3. Return whatever the injected script wrote (may still be null)
  return document.documentElement.getAttribute('data-snd-gck') || null;
}

function xhrGet(url) {
  return new Promise((resolve, reject) => {
    const token = getSnToken();
    if (!token) {
      reject(new Error('g_ck token not found — open a ServiceNow page first'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-UserToken', token);
    xhr.onload = () => {
      if (xhr.status === 200) {
        try { resolve(JSON.parse(xhr.responseText).result); }
        catch(e) { reject(e); }
      } else {
        reject(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send();
  });
}

function xhrPatch(url, payload) {
  return new Promise((resolve, reject) => {
    const token = getSnToken();
    if (!token) {
      reject(new Error('g_ck token not found — open a ServiceNow page first'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-UserToken', token);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(JSON.stringify(payload));
  });
}

// ── Main cycle ────────────────────────────────────────────────────────────────
async function runCycle() {
  if (engineState !== 'running') return;

  // Which groups to process
  let toProcess = groups.filter(g => g.active !== false && g.query && (g.agents||[]).some(a => a.active !== false));
  if (activeGroupId) toProcess = toProcess.filter(g => g.id === activeGroupId);

  if (toProcess.length === 0) {
    log('No active groups with agents — skipping', '#fbbf24', '⚠️');
    startCountdown(runCycle);
    return;
  }

  cyclesRun++;
  updateStats();
  logDivider('Cycle #' + cyclesRun + ' · ' + toProcess.length + ' group(s)');

  let cycleAssigned = 0;

  for (const g of toProcess) {
    if (engineState !== 'running') break;
    try {
      const count = await processGroup(g);
      cycleAssigned += count;
    } catch(e) {
      log(g.name + ': error — ' + e.message, '#f87171', '❌');
    }
  }

  sessionAssigned += cycleAssigned;
  totalAssigned   += cycleAssigned;
  await saveState();
  updateStats();

  log('Cycle done · ' + cycleAssigned + ' assigned', '#4ade80', '✅');
  startCountdown(runCycle);
}

async function processGroup(g) {
  log(g.name, '#38bdf8', '📋');

  const origin = location.origin; // e.g. https://dev268275.service-now.com
  const url = origin + '/api/now/table/' + (g.table || 'incident') +
    '?sysparm_query=' + encodeURIComponent(g.query) +
    '&sysparm_fields=sys_id,number&sysparm_limit=500';

  let tickets;
  try {
    tickets = await xhrGet(url);
  } catch(e) {
    log('  Fetch failed: ' + e.message, '#f87171', '  ❌');
    return 0;
  }

  if (!tickets || tickets.length === 0) {
    log('  No unassigned tickets', '#64748b', '  ✓');
    return 0;
  }
  log('  ' + tickets.length + ' ticket(s) found', '#90cdf4');

  const activeAgents = (g.agents||[]).filter(a => a.active !== false);
  if (activeAgents.length === 0) { log('  No active agents', '#fbbf24', '  ⚠️'); return 0; }

  let rrIdx    = await getRR(g.id);
  let assigned = 0;

  for (const ticket of tickets) {
    if (engineState !== 'running') {
      log('  Engine stopped — halting mid-cycle', '#fbbf24', '⏹');
      break;
    }
    const agent    = activeAgents[rrIdx % activeAgents.length];
    const patchUrl = origin + '/api/now/table/' + (g.table || 'incident') + '/' + ticket.sys_id;
    let ok = false;
    try {
      ok = await xhrPatch(patchUrl, { assigned_to: agent.sys_id });
    } catch(e) { /* handled below */ }

    if (ok) {
      assigned++;
      rrIdx++;
      log('  ' + ticket.number + ' → ' + agent.name, '#4ade80', '  ✅');
    } else {
      log('  ' + ticket.number + ' failed', '#f87171', '  ❌');
    }
  }

  await setRR(g.id, rrIdx);
  return assigned;
}

// ── Load state from storage ───────────────────────────────────────────────────
async function loadState() {
  const res = await browser.runtime.sendMessage({ type: 'LOAD_STATE' });
  groups        = res.groups        || [];
  totalAssigned = (res.stats || {}).totalAssigned || 0;
  cyclesRun     = (res.stats || {}).cyclesRun     || 0;
  rebuildGroupSelect();
  updateStats();
  setEngineState('stopped');
}

function rebuildGroupSelect() {
  // Keep the "All" option, remove rest
  while (groupSelect.options.length > 1) groupSelect.remove(1);
  groups.filter(g => g.active !== false).forEach(g => {
    const opt = document.createElement('option');
    opt.value       = g.id;
    opt.textContent = g.name || 'Unnamed';
    groupSelect.appendChild(opt);
  });
  groupSelect.value = activeGroupId || '';
}

groupSelect.addEventListener('change', () => {
  activeGroupId = groupSelect.value || null;
});

// ── Button handlers ───────────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  const activeGroups = groups.filter(g => g.active !== false && g.query && (g.agents||[]).some(a => a.active !== false));
  if (activeGroups.length === 0) {
    log('No groups configured — click ⚙ to set up', '#fbbf24', '⚠️');
    return;
  }
  sessionAssigned = 0;
  setEngineState('running');
  log('Engine started', '#4ade80', '🚀');
  runCycle();
});

btnPause.addEventListener('click', () => {
  if (engineState === 'running') {
    setEngineState('paused');
    log('Paused', '#fbbf24', '⏸');
  } else if (engineState === 'paused') {
    setEngineState('running');
    log('Resumed', '#4ade80', '▶');
  }
});

btnStop.addEventListener('click', () => {
  clearInterval(countdownId);
  countdownId = null;
  remainingMs = 0;
  setEngineState('stopped');
  log('Engine stopped', '#f87171', '⏹');
});

intervalSelect.addEventListener('change', () => {
  intervalSecs = parseInt(intervalSelect.value) || 60;
});

// ── Listen for config updates from config page ────────────────────────────────
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RELOAD_STATE') {
    loadState().then(() => log('Config reloaded', '#38bdf8', '🔄'));
  }
});

// ── Draggable widget ──────────────────────────────────────────────────────────
let dragging = false, dragOffX = 0, dragOffY = 0;

document.getElementById('snd-panel-header').addEventListener('mousedown', e => {
  if (e.target.id === 'snd-close-btn') return;
  dragging = true;
  const rect = host.getBoundingClientRect();
  dragOffX = e.clientX - rect.left;
  dragOffY = e.clientY - rect.top;
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const x = e.clientX - dragOffX;
  const y = e.clientY - dragOffY;
  host.style.left   = x + 'px';
  host.style.top    = y + 'px';
  host.style.right  = 'auto';
  host.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => { dragging = false; });

// ── Init ──────────────────────────────────────────────────────────────────────
loadState();

} // end guard
