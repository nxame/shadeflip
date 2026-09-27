// Shadeflip content script: decide whether this page should be flipped.
(() => {
  if (globalThis.__shadeflip) return; // already injected
  globalThis.__shadeflip = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const host = location.hostname;
  const root = document.documentElement;
  if (!host || !root) return;

  const SITE = 's:' + host;   // storage.sync: "dark" | "light" | "off"
  const CACHE = 'c:' + host;  // storage.local: last detected natural look

  let want = 'off';     // what the user asked for on this site
  let natural = null;   // how the page looks on its own: "dark" | "light"
  let canvasOnly = false;
  let flipped = false;

  const opposite = (look) => (look === 'dark' ? 'light' : 'dark');

  function apply() {
    const guess = natural ?? 'light';
    flipped = want !== 'off' && guess !== want;
    if (flipped) root.setAttribute('data-shadeflip', canvasOnly ? 'canvas' : '');
    else root.removeAttribute('data-shadeflip');
    const look = flipped ? opposite(guess) : guess;
    api.runtime.sendMessage({ type: 'state', host, look, want }).catch(() => {});
  }

  // --- brightness detection ------------------------------------------------

  let ctx;
  function rgba(color) {
    // Let the browser parse any CSS colour (rgb, oklch, color(), ...) into sRGB.
    ctx ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
      .getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#0000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  }

  function isDark(color) {
    const [r, g, b] = rgba(color);
    const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.2;
  }

  const bg = (el) => {
    const c = getComputedStyle(el).backgroundColor;
    return rgba(c)[3] > 127 ? c : null;
  };

  // Colour of the page itself when nothing paints a background.
  function canvasIsDark() {
    const scheme = (document.querySelector('meta[name="color-scheme"]')?.content || '') + ' ' +
      getComputedStyle(root).colorScheme;
    if (!/dark/.test(scheme)) return false;
    return !/light/.test(scheme) || matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Background behind one element, walking up to the page canvas.
  function backgroundAt(el) {
    for (; el && el !== root && el !== document.body; el = el.parentElement) {
      const c = bg(el);
      if (c) return c;
    }
    return (document.body && bg(document.body)) || bg(root);
  }

  function detect() {
    const body = document.body;
    if (!body) return;
    const w = innerWidth, h = innerHeight;
    const points = [[.5, .5], [.25, .25], [.75, .25], [.25, .75], [.75, .75]];
    let dark = 0;
    for (const [x, y] of points) {
      const c = backgroundAt(document.elementFromPoint(w * x, h * y) ?? body);
      dark += c ? isDark(c) : canvasIsDark();
    }
    canvasOnly = !bg(root) && !bg(body);
    const look = dark * 2 > points.length ? 'dark' : 'light';
    if (look !== natural) {
      natural = look;
      api.storage.local.set({ [CACHE]: look });
    }
    apply();
  }

  // --- wiring --------------------------------------------------------------

  let timer;
  const later = (ms = 250) => { clearTimeout(timer); timer = setTimeout(detect, ms); };

  const ready = (async () => {
    const [sync, local] = await Promise.all([
      api.storage.sync.get([SITE, 'mode']),
      api.storage.local.get(CACHE),
    ]);
    want = sync[SITE] ?? sync.mode ?? 'off';
    natural = local[CACHE] ?? null;
    apply(); // early, from cache, to avoid a flash before the page renders
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => detect(), { once: true });
    } else {
      detect();
    }
    addEventListener('load', () => later(100), { once: true });
  })();

  // Pages that switch their own theme (class/style changes on html or body).
  const watch = new MutationObserver(() => later());
  const opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
  watch.observe(root, opts);
  if (document.body) watch.observe(document.body, opts);
  else document.addEventListener('DOMContentLoaded', () => document.body && watch.observe(document.body, opts), { once: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => later(0));

  // Someone else removed our attribute (e.g. a framework rewrote <html>).
  new MutationObserver(() => {
    if (flipped && !root.hasAttribute('data-shadeflip')) apply();
  }).observe(root, { attributes: true, attributeFilter: ['data-shadeflip'] });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !(SITE in changes || 'mode' in changes)) return;
    api.storage.sync.get([SITE, 'mode']).then((s) => {
      want = s[SITE] ?? s.mode ?? 'off';
      apply();
    });
  });

  // Toolbar click / shortcut: flip whatever the page looks like right now.
  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'toggle') return;
    ready.then(() => {
      if (document.body) detect();
      const look = flipped ? opposite(natural ?? 'light') : (natural ?? 'light');
      want = opposite(look);
      apply();
      api.storage.sync.set({ [SITE]: want });
      sendResponse(want);
    });
    return true; // async response
  });
})();
