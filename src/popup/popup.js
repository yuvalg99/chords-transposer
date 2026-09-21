'use strict';

const $ = (id) => document.getElementById(id);
let tab = null;
let status = null;

function askPage(message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      void chrome.runtime.lastError;   // no content script on this page
      resolve(response || null);
    });
  });
}

function renderKeyLine() {
  const line = $('keyline');
  line.textContent = '';
  if (!status || !status.key || !status.keyNow) return;

  line.appendChild(document.createTextNode(status.key + ' → '));
  const now = document.createElement('b');
  now.textContent = status.keyNow;
  line.appendChild(now);

  if (status.steps < 0) {
    const capo = document.createElement('span');
    capo.className = 'capo';
    capo.textContent = `capo ${-status.steps} sounds like the original`;
    line.appendChild(capo);
  }
}

function render() {
  const active = !!(status && status.active && !status.disabled);
  const disabled = !!(status && status.disabled);

  $('controls').classList.toggle('hidden', !active);
  if (active) {
    $('steps').textContent = (status.steps > 0 ? '+' : '') + status.steps;
    renderKeyLine();
  }

  $('note-card').classList.toggle('hidden', !status || active);
  if (status && !active) {
    $('note').textContent = disabled
      ? 'Turned off on this site.'
      : 'No chords found on this page.';
    $('look').classList.toggle('hidden', disabled);
  }

  $('site-toggle').classList.toggle('hidden', !status);
  $('site-toggle').textContent = disabled
    ? 'Turn back on for this site'
    : 'Turn off on this site';
}

async function refresh() {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = current;
  status = (tab && /^https?:/.test(tab.url || '')) ? await askPage({ type: 'ct-status' }) : null;
  render();
}

async function step(delta) {
  if (!status) return;
  await askPage({ type: 'ct-set-steps', steps: status.steps + delta });
  status = await askPage({ type: 'ct-status' });
  render();
}

$('up').onclick = () => step(1);
$('down').onclick = () => step(-1);
$('reset').onclick = async () => {
  await askPage({ type: 'ct-set-steps', steps: 0 });
  status = await askPage({ type: 'ct-status' });
  render();
};
$('show').onclick = async () => { await askPage({ type: 'ct-show' }); window.close(); };
$('look').onclick = async () => {
  const result = await askPage({ type: 'ct-show' });
  if (result && result.chords) { window.close(); return; }
  $('note').textContent = 'Still nothing here that looks like a chord sheet.';
};
$('site-toggle').onclick = async () => {
  const turningOff = !(status && status.disabled);
  const host = status.host;
  const { 'ct:disabled': list = [] } = await chrome.storage.local.get('ct:disabled');
  const next = turningOff
    ? list.concat(list.includes(host) ? [] : [host])
    : list.filter((h) => h !== host);
  await chrome.storage.local.set({ 'ct:disabled': next });
  await askPage({ type: 'ct-set-disabled', disabled: turningOff });
  status = await askPage({ type: 'ct-status' });
  render();
};
$('forget').onclick = async () => {
  const all = await chrome.storage.local.get(null);
  const songs = Object.keys(all).filter((k) => k.startsWith('song:'));
  await chrome.storage.local.remove(songs);
  $('forget').textContent = `Cleared ${songs.length}`;
};

refresh();
