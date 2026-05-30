'use strict';

// Open config page when toolbar icon popup button asks for it
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Widget asks: open config in new tab
  if (msg.type === 'OPEN_CONFIG') {
    browser.tabs.create({ url: browser.runtime.getURL('config.html') });
    return;
  }

  // Widget asks: load all groups + stats from storage
  if (msg.type === 'LOAD_STATE') {
    browser.storage.local.get(
      ['snDispatcherGroups', 'snDispatcherStats', 'snDispatcherRR'],
      res => sendResponse({
        groups:    res.snDispatcherGroups || [],
        stats:     res.snDispatcherStats  || { totalAssigned: 0, cyclesRun: 0 },
        rr:        res.snDispatcherRR     || {}
      })
    );
    return true; // async
  }

  // Widget asks: save groups + stats
  if (msg.type === 'SAVE_STATE') {
    browser.storage.local.set({
      snDispatcherGroups: msg.groups,
      snDispatcherStats:  msg.stats
    }, () => sendResponse({ ok: true }));
    return true;
  }

  // Widget asks: get/set RR index
  if (msg.type === 'GET_RR') {
    browser.storage.local.get('snDispatcherRR', r => {
      const rr = r.snDispatcherRR || {};
      sendResponse({ idx: rr[msg.groupId] || 0 });
    });
    return true;
  }
  if (msg.type === 'SET_RR') {
    browser.storage.local.get('snDispatcherRR', r => {
      const rr = r.snDispatcherRR || {};
      rr[msg.groupId] = msg.idx;
      browser.storage.local.set({ snDispatcherRR: rr }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Config page asks: notify all SN tabs to reload their state
  if (msg.type === 'CONFIG_UPDATED') {
    browser.tabs.query({}, tabs => {
      tabs.forEach(t => {
        if (t.url && (/service-now\.com/i.test(t.url) || /mercedes-benz\.com/i.test(t.url))) {
          browser.tabs.sendMessage(t.id, { type: 'RELOAD_STATE' }).catch(() => {});
        }
      });
    });
    return;
  }
});

// (onClicked is not used — popup handles config tab opening directly)
