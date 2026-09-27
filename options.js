const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const LABELS = { dark: 'Dark', light: 'Light', off: 'Off' };

function select(value, onChange) {
  const s = document.createElement('select');
  for (const [v, t] of Object.entries(LABELS)) s.add(new Option(t, v, false, v === value));
  s.onchange = () => onChange(s.value);
  return s;
}

async function render() {
  const all = await api.storage.sync.get(null);
  for (const r of document.getElementsByName('mode')) r.checked = r.value === (all.mode ?? 'off');

  const rows = Object.keys(all).filter((k) => k.startsWith('s:')).sort().map((key) => {
    const tr = document.createElement('tr');
    const remove = Object.assign(document.createElement('button'), { textContent: 'Remove' });
    remove.onclick = () => api.storage.sync.remove(key);
    tr.append(document.createElement('td'), document.createElement('td'), document.createElement('td'));
    tr.cells[0].textContent = key.slice(2);
    tr.cells[1].append(select(all[key], (v) => api.storage.sync.set({ [key]: v })));
    tr.cells[2].append(remove);
    return tr;
  });
  $('sites').replaceChildren(...rows);
}

for (const r of document.getElementsByName('mode')) {
  r.onchange = () => api.storage.sync.set({ mode: r.value });
}

$('add').onclick = () => {
  let host = $('new-host').value.trim().toLowerCase();
  try { host = new URL(host.includes('://') ? host : 'https://' + host).hostname; } catch { return; }
  if (!host) return;
  api.storage.sync.set({ ['s:' + host]: $('new-want').value });
  $('new-host').value = '';
};
$('new-host').onkeydown = (e) => e.key === 'Enter' && $('add').click();

$('shortcuts').onclick = async (e) => {
  e.preventDefault();
  if (api.commands.openShortcutSettings) return api.commands.openShortcutSettings();
  if (!globalThis.browser) return api.tabs.create({ url: 'chrome://extensions/shortcuts' });
  $('shortcut-help').textContent =
    'Open about:addons, click the gear icon, then "Manage Extension Shortcuts".';
  $('shortcut-help').hidden = false;
};

api.commands.getAll().then((cmds) => {
  const key = cmds.find((c) => c.name === '_execute_action')?.shortcut;
  $('shortcut').textContent = key || 'not set';
});

api.storage.onChanged.addListener((_, area) => area === 'sync' && render());
render();
