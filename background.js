// Shadeflip background: toolbar click / Alt+Shift+D -> flip the current site.
const api = globalThis.browser ?? globalThis.chrome;

async function toggle(tab) {
  if (!tab?.id) return;
  try {
    await api.tabs.sendMessage(tab.id, { type: 'toggle' }, { frameId: 0 });
  } catch {
    // Tab was open before Shadeflip was installed: inject, then try again.
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await api.scripting.insertCSS({ target: { tabId: tab.id }, files: ['flip.css'] });
      await api.tabs.sendMessage(tab.id, { type: 'toggle' }, { frameId: 0 });
    } catch {
      // Browser pages (settings, stores, PDFs) can't be changed by extensions.
    }
  }
}

api.action.onClicked.addListener(toggle);

// Show what the site is set to in the toolbar tooltip.
api.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'state' || !sender.tab || sender.frameId) return;
  const set = msg.want === 'off' ? 'left as is' : msg.want === 'dark' ? 'Dark' : 'Light';
  api.action.setTitle({
    tabId: sender.tab.id,
    title: `Shadeflip: ${msg.host} (${set}). Click for ${msg.look === 'dark' ? 'Light' : 'Dark'}.`,
  });
});

api.runtime.onInstalled.addListener(async () => {
  // Brightness notes are kept only for sites with their own setting. Drop
  // any that earlier versions saved for every site visited.
  const [sync, local] = await Promise.all([api.storage.sync.get(null), api.storage.local.get(null)]);
  const stale = Object.keys(local).filter((k) => k.startsWith('c:') && !(('s:' + k.slice(2)) in sync));
  if (stale.length) api.storage.local.remove(stale);

  // Firefox has no "Options" item on the toolbar button's menu; add one.
  if (!globalThis.browser) return;
  api.contextMenus.create({ id: 'options', title: 'Shadeflip settings', contexts: ['action'] });
});
api.contextMenus?.onClicked.addListener((info) => {
  if (info.menuItemId === 'options') api.runtime.openOptionsPage();
});
