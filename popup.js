'use strict';
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('btnConfig').addEventListener('click', function () {
    browser.tabs.create({ url: browser.runtime.getURL('config.html') });
    window.close();
  });
});
