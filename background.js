// Shadeflip background: toolbar click / Alt+Shift+D -> flip the current site.
const api = globalThis.browser ?? globalThis.chrome;

// Random per-install attribute for flip.css, so pages can't probe for Shadeflip.
async function attrName() {
  let { attr } = await api.storage.local.get('attr');
  if (!attr) {
    attr = 'data-' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => String.fromCharCode(97 + n % 26)).join('');
    await api.storage.local.set({ attr });
  }
  return attr;
}
let flipCSS;
const css = () => (flipCSS ??= Promise.all([fetch('flip.css').then((r) => r.text()), attrName()])
  .then(([text, attr]) => text.replaceAll('data-shadeflip', attr)));
attrName();

async function toggle(tab) {
  if (!tab?.id) return;
  try {
    await api.tabs.sendMessage(tab.id, { type: 'toggle' }, { frameId: 0 });
  } catch {
    // Tab was open before Shadeflip was installed: inject, then try again.
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await api.tabs.sendMessage(tab.id, { type: 'toggle' }, { frameId: 0 });
    } catch {
      // Browser pages (settings, stores, PDFs) can't be changed by extensions.
    }
  }
}

api.action.onClicked.addListener(toggle);

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender.tab || sender.frameId) return;

  // A page is being flipped: add the flip rules.
  if (msg?.type === 'css') {
    css()
      .then((text) => api.scripting.insertCSS({ target: { tabId: sender.tab.id, frameIds: [0] }, css: text }))
      .then(() => sendResponse(true), () => sendResponse(false));
    return true; // async response
  }

  // Show what the site is set to in the toolbar tooltip.
  if (msg?.type !== 'state') return;
  const set = msg.want === 'off' ? 'left as is' : msg.want === 'dark' ? 'Dark' : 'Light';
  api.action.setTitle({
    tabId: sender.tab.id,
    title: msg.full ? "Shadeflip: couldn't save, the site list is full." : `Shadeflip: ${msg.host} (${set}). Click for ${msg.look === 'dark' ? 'Light' : 'Dark'}.`,
  });
});

api.runtime.onInstalled.addListener(async () => {
  // Brightness notes are kept only for sites with their own setting. Drop
  // any that earlier versions saved for every site visited.
  const [sync, local] = await Promise.all([api.storage.sync.get(null), api.storage.local.get(null)]);
  const stale = Object.keys(local).filter((k) => k.startsWith('c:') && !(('s:' + k.slice(2)) in sync));
  if (stale.length) api.storage.local.remove(stale);

  // Settings item on the toolbar button's menu (Firefox has none of its own).
  await api.contextMenus.removeAll();
  api.contextMenus.create({ id: 'options', title: 'Shadeflip settings', contexts: ['action'] });
});
api.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'options') api.runtime.openOptionsPage();
});
