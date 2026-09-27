// Shadeflip background: toolbar click / Alt+Shift+D -> flip the current site.
const api = globalThis.browser ?? globalThis.chrome;

// flip.css, with data-shadeflip swapped for the page's own random attribute.
let flipCSS;
const css = async (attr) => (await (flipCSS ??= fetch('flip.css').then((r) => r.text()))).replaceAll('data-shadeflip', attr);

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
    if (!/^data-[a-z]{10}$/.test(msg.attr)) return;
    css(msg.attr)
      .then((text) => api.scripting.insertCSS({ target: { tabId: sender.tab.id, frameIds: [0] }, css: text }))
      .then(() => sendResponse(true), () => sendResponse(false));
    return true; // async response
  }

  // Show what the site is set to in the toolbar tooltip.
  if (msg?.type !== 'state') return;
  const set = msg.want === 'off' ? 'left as is' : msg.want === 'dark' ? 'Dark' : 'Light';
  api.action.setTitle({
    tabId: sender.tab.id,
    title: msg.unsaved ? "Shadeflip: couldn't save this site. The list may be full (512 sites)." : `Shadeflip: ${msg.host} (${set}). Click for ${msg.look === 'dark' ? 'Light' : 'Dark'}.`,
  });
});

api.runtime.onInstalled.addListener(async () => {
  // Brightness notes are kept only for sites with their own setting. Drop
  // any that earlier versions saved for every site visited.
  const [sync, local] = await Promise.all([api.storage.sync.get(null), api.storage.local.get(null)]);
  const stale = Object.keys(local).filter((k) => k.startsWith('c:') && !(('s:' + k.slice(2)) in sync));
  api.storage.local.remove([...stale, 'attr']); // attr: a 1.0.2 test build's name

  // Settings item on the toolbar button's menu (Firefox has none of its own).
  await api.contextMenus.removeAll();
  api.contextMenus.create({ id: 'options', title: 'Shadeflip settings', contexts: ['action'] });
});
api.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'options') api.runtime.openOptionsPage();
});
