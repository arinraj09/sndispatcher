'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let groups   = [];
let activeId = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const toast           = document.getElementById('toast');
const groupList       = document.getElementById('groupList');
const editorPanel     = document.getElementById('editorPanel');
const btnAddGroup     = document.getElementById('btnAddGroup');
const btnExport       = document.getElementById('btnExport');
const btnImport       = document.getElementById('btnImport');
const importFileInput = document.getElementById('importFileInput');

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, color) {
  toast.textContent      = msg;
  toast.style.background = color || '#1f2937';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Storage ───────────────────────────────────────────────────────────────────
function saveGroups(cb) {
  browser.storage.local.set({ snDispatcherGroups: groups }, () => {
    // Notify all open SN tabs to reload their widget state
    browser.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
    if (cb) cb();
  });
}

function loadGroups(cb) {
  browser.storage.local.get('snDispatcherGroups', res => {
    groups = res.snDispatcherGroups || [];
    cb();
  });
}

// ── Export / Import ───────────────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  browser.storage.local.get(
    ['snDispatcherGroups', 'snDispatcherStats', 'snDispatcherRR'],
    res => {
      const payload = {
        version:    '2.0',
        exportedAt: new Date().toISOString(),
        groups:     res.snDispatcherGroups || [],
        stats:      res.snDispatcherStats  || {},
        rr:         res.snDispatcherRR     || {}
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'sn-dispatcher-config-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('✅ Config exported!', '#14532d');
    }
  );
});

btnImport.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.groups || !Array.isArray(data.groups)) throw new Error('Invalid format');
      if (!confirm('Import config? This will replace all current groups and agents.')) return;
      browser.storage.local.set({
        snDispatcherGroups: data.groups,
        snDispatcherStats:  data.stats || {},
        snDispatcherRR:     data.rr    || {}
      }, () => {
        loadGroups(() => {
          renderGroupList();
          showEditorEmpty();
          browser.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
          showToast('✅ Imported ' + data.groups.length + ' group(s)!', '#14532d');
        });
      });
    } catch {
      showToast('❌ Invalid config file', '#7f1d1d');
    }
  };
  reader.readAsText(file);
  importFileInput.value = '';
});

// ── Unique ID ─────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Render group list ─────────────────────────────────────────────────────────
function renderGroupList() {
  groupList.innerHTML = '';
  if (groups.length === 0) {
    const el = document.createElement('div');
    el.className = 'empty-sidebar';
    el.innerHTML = 'No groups yet.<br>Click <strong>+ Add Group</strong> to start.';
    groupList.appendChild(el);
    return;
  }
  groups.forEach(g => {
    const item = document.createElement('div');
    item.className = 'group-item' + (g.id === activeId ? ' active' : '');

    const left    = document.createElement('div');
    left.style.flex = '1';
    const nameEl  = document.createElement('div');
    nameEl.className   = 'group-item-name';
    nameEl.textContent = g.name || 'Unnamed Group';
    const metaEl  = document.createElement('div');
    metaEl.className   = 'group-item-meta';
    const count        = (g.agents || []).filter(a => a.active !== false).length;
    metaEl.textContent = count + ' agent' + (count !== 1 ? 's' : '') + ' · ' + (g.table || 'incident');
    left.appendChild(nameEl);
    left.appendChild(metaEl);

    const badge = document.createElement('div');
    badge.className   = 'group-badge' + (g.active !== false ? ' running' : '');
    badge.textContent = g.active !== false ? 'on' : 'off';

    item.appendChild(left);
    item.appendChild(badge);
    item.addEventListener('click', () => selectGroup(g.id));
    groupList.appendChild(item);
  });
}

function selectGroup(id) {
  activeId = id;
  const g  = groups.find(x => x.id === id);
  if (!g) return;
  renderGroupList();
  renderEditor(g);
}

// ── Editor ────────────────────────────────────────────────────────────────────
function renderEditor(g) {
  editorPanel.innerHTML = '';
  editorPanel.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;';

  // Header
  const hdr      = document.createElement('div');
  hdr.className  = 'editor-header';
  const titleEl  = document.createElement('div');
  titleEl.className   = 'editor-title';
  titleEl.textContent = g.name || 'Configure Group';

  const hdrRight = document.createElement('div');
  hdrRight.style.cssText = 'display:flex;gap:8px;align-items:center;';

  const twrap = document.createElement('div');
  twrap.className = 'toggle-wrap';
  const tlbl  = document.createElement('span');
  tlbl.style.cssText = 'font-size:11px;color:var(--muted);';
  tlbl.textContent   = 'Active';
  const tog   = document.createElement('div');
  tog.className = 'toggle' + (g.active !== false ? ' on' : '');
  tog.title     = 'Enable/disable this group';
  tog.addEventListener('click', () => {
    g.active = !tog.classList.contains('on');
    tog.classList.toggle('on');
    saveGroups(() => renderGroupList());
  });
  twrap.appendChild(tlbl);
  twrap.appendChild(tog);

  const delBtn = document.createElement('button');
  delBtn.className   = 'btn btn-red';
  delBtn.style.padding = '5px 12px';
  delBtn.textContent = '🗑 Delete';
  delBtn.addEventListener('click', () => {
    if (!confirm('Delete group "' + g.name + '"?')) return;
    groups = groups.filter(x => x.id !== g.id);
    activeId = null;
    saveGroups(() => { renderGroupList(); showEditorEmpty(); });
    showToast('🗑 Group deleted', '#7f1d1d');
  });

  hdrRight.appendChild(twrap);
  hdrRight.appendChild(delBtn);
  hdr.appendChild(titleEl);
  hdr.appendChild(hdrRight);
  editorPanel.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'editor-body';

  // Group name
  appendField(body, 'Group Name', inp => {
    inp.value       = g.name || '';
    inp.placeholder = 'e.g. IDB Dispatcher';
    inp.addEventListener('input', () => {
      g.name = inp.value;
      titleEl.textContent = g.name || 'Configure Group';
      saveGroups(() => renderGroupList());
    });
  });

  // Table
  appendField(body, 'Table', inp => {
    inp.value       = g.table || 'incident';
    inp.placeholder = 'e.g. incident, sc_task, change_request';
    inp.addEventListener('input', () => { g.table = inp.value.trim(); saveGroups(() => renderGroupList()); });
  }, 'tableInput');
  const tableInput = body.querySelector('[data-ref="tableInput"]');

  // URL Converter
  const conv  = document.createElement('div');
  conv.className = 'url-converter';
  conv.innerHTML = `
    <div class="url-converter-title">🔗 URL → Query Converter</div>
    <div style="font-size:10px;color:var(--muted);margin-bottom:8px;">
      Paste any ServiceNow list URL — query and table auto-apply on Add.
    </div>
    <div class="url-row">
      <input class="url-input" id="convInput" placeholder="Paste ServiceNow list URL here..." />
      <button class="btn btn-primary" id="convBtn" style="padding:7px 14px;">Add</button>
    </div>
    <div id="convStatus" style="font-size:10px;margin-top:6px;display:none;"></div>
  `;
  body.appendChild(conv);

  // Query field — must exist before convBtn handler
  const qWrap = document.createElement('div');
  qWrap.className = 'field-group';
  const qLbl  = document.createElement('div');
  qLbl.className   = 'field-label';
  qLbl.textContent = 'Filter Query (sysparm_query value)';
  const queryInput = document.createElement('input');
  queryInput.className   = 'field-input';
  queryInput.value       = g.query || '';
  queryInput.placeholder = 'e.g. assignment_group=abc123^assigned_toISEMPTY';
  queryInput.style.fontFamily = 'monospace';
  queryInput.addEventListener('input', () => { g.query = queryInput.value.trim(); saveGroups(); });
  qWrap.appendChild(qLbl);
  qWrap.appendChild(queryInput);
  body.appendChild(qWrap);

  // Wire up converter now that queryInput exists
  const convInput  = conv.querySelector('#convInput');
  const convBtn    = conv.querySelector('#convBtn');
  const convStatus = conv.querySelector('#convStatus');

  function applyUrl() {
    const raw = convInput.value.trim();
    if (!raw) { showToast('⚠️ Paste a URL first', '#7f1d1d'); return; }
    const q = extractQuery(raw);
    const t = extractTable(raw);
    if (!q) {
      convStatus.textContent  = '⚠️ No sysparm_query found — make sure you copied a filtered list URL.';
      convStatus.style.color  = '#f87171';
      convStatus.style.display = 'block';
      return;
    }
    queryInput.value = q;
    g.query = q;
    if (t && tableInput) { tableInput.value = t; g.table = t; }
    saveGroups(() => renderGroupList());
    convInput.value  = '';
    convStatus.textContent  = '✅ Query' + (t ? ' + table (' + t + ')' : '') + ' applied!';
    convStatus.style.color  = '#4ade80';
    convStatus.style.display = 'block';
    setTimeout(() => convStatus.style.display = 'none', 3000);
    showToast('✅ Query applied!', '#14532d');
  }
  convBtn.addEventListener('click', applyUrl);
  convInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyUrl(); });

  // Agents section
  const agentsSec = document.createElement('div');
  agentsSec.className = 'field-group';
  const agentsLbl = document.createElement('div');
  agentsLbl.className   = 'field-label';
  agentsLbl.textContent = 'Agents (Round Robin)';
  agentsSec.appendChild(agentsLbl);

  function renderAgents() {
    while (agentsSec.children.length > 1) agentsSec.removeChild(agentsSec.lastChild);
    (g.agents || []).forEach((agent, idx) => {
      const item = document.createElement('div');
      item.className = 'agent-item' + (agent.active === false ? ' inactive' : '');

      const tog2 = document.createElement('div');
      tog2.className = 'toggle' + (agent.active !== false ? ' on' : '');
      tog2.style.cssText = 'width:28px;height:16px;flex-shrink:0;';
      tog2.addEventListener('click', () => {
        agent.active = !tog2.classList.contains('on');
        tog2.classList.toggle('on');
        item.classList.toggle('inactive', agent.active === false);
        saveGroups();
      });

      const nameI = document.createElement('input');
      nameI.className = 'field-input';
      nameI.style.cssText = 'flex:1;padding:4px 8px;font-size:11px;';
      nameI.value = agent.name || '';
      nameI.placeholder = 'Agent name';
      nameI.addEventListener('input', () => { agent.name = nameI.value; saveGroups(); });

      const sysI = document.createElement('input');
      sysI.className = 'field-input';
      sysI.style.cssText = 'width:230px;padding:4px 8px;font-size:11px;font-family:monospace;';
      sysI.value = agent.sys_id || '';
      sysI.placeholder = 'sys_id (32 hex chars)';
      sysI.addEventListener('input', () => { agent.sys_id = sysI.value.trim(); saveGroups(); });

      const del = document.createElement('span');
      del.className   = 'agent-del';
      del.textContent = '×';
      del.title       = 'Remove agent';
      del.addEventListener('click', () => {
        g.agents.splice(idx, 1);
        saveGroups(() => renderAgents());
      });

      item.appendChild(tog2);
      item.appendChild(nameI);
      item.appendChild(sysI);
      item.appendChild(del);
      agentsSec.appendChild(item);
    });

    // Add row
    const addRow   = document.createElement('div');
    addRow.className = 'add-agent-row';
    const addName  = document.createElement('input');
    addName.placeholder = 'Agent name';
    addName.style.flex  = '1';
    const addSys   = document.createElement('input');
    addSys.placeholder  = 'sys_id (32 chars)';
    addSys.style.cssText = 'width:230px;font-family:monospace;';
    const addBtn2  = document.createElement('button');
    addBtn2.className   = 'btn btn-primary';
    addBtn2.style.padding = '6px 12px';
    addBtn2.textContent = '+ Add';
    addBtn2.addEventListener('click', () => {
      const name  = addName.value.trim();
      const sysId = addSys.value.trim();
      if (!name || !sysId) { showToast('⚠️ Name and sys_id required', '#7f1d1d'); return; }
      if (sysId.length !== 32) { showToast('⚠️ sys_id must be 32 chars', '#7f1d1d'); return; }
      if (!g.agents) g.agents = [];
      g.agents.push({ name, sys_id: sysId, active: true });
      addName.value = ''; addSys.value = '';
      saveGroups(() => renderAgents());
      showToast('✅ Agent added!', '#14532d');
    });
    addRow.appendChild(addName);
    addRow.appendChild(addSys);
    addRow.appendChild(addBtn2);
    agentsSec.appendChild(addRow);
  }

  renderAgents();
  body.appendChild(agentsSec);
  editorPanel.appendChild(body);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function appendField(parent, label, setup, ref) {
  const wrap = document.createElement('div');
  wrap.className = 'field-group';
  const lbl  = document.createElement('div');
  lbl.className   = 'field-label';
  lbl.textContent = label;
  const inp  = document.createElement('input');
  inp.className   = 'field-input';
  if (ref) inp.dataset.ref = ref;
  setup(inp);
  wrap.appendChild(lbl);
  wrap.appendChild(inp);
  parent.appendChild(wrap);
}

function extractQuery(url) {
  try {
    const d = decodeURIComponent(url);
    const m = d.match(/sysparm_query=([^&]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

function extractTable(url) {
  try {
    const d = decodeURIComponent(url);
    let m = d.match(/[?&]target=([a-z_]+)_list\.do/);
    if (m) return m[1];
    m = d.match(/\/([a-z_]+)_list\.do/);
    return m ? m[1] : null;
  } catch { return null; }
}

function showEditorEmpty() {
  editorPanel.style.cssText = '';
  editorPanel.innerHTML = `
    <div class="editor-empty">
      <div class="editor-empty-icon">👥</div>
      <div>Select a group to configure<br>or click <strong>+ Add Group</strong></div>
    </div>`;
}

// ── Add group ─────────────────────────────────────────────────────────────────
btnAddGroup.addEventListener('click', () => {
  const g = { id: uid(), name: 'New Group', table: 'incident', query: '', agents: [], active: true };
  groups.push(g);
  saveGroups(() => { renderGroupList(); selectGroup(g.id); });
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadGroups(() => { renderGroupList(); });
