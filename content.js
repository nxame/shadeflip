// Shadeflip content script: decide whether this page should be flipped.
(() => {
  if (globalThis.__shadeflip) return; // already injected
  globalThis.__shadeflip = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const host = location.hostname;
  const root = document.documentElement;
  if (!host || !root) return;

  const SITE = 's:' + host;   // storage.sync: "dark" | "light" | "off"
  const CACHE = 'c:' + host;  // storage.local: last detected natural look, kept
                              // only for sites with their own setting

  // Private window: flips last for the tab, nothing is saved.
  const isPrivate = !!api.extension?.inIncognitoContext;

  let want = 'off';     // what the user asked for on this site
  let held = false;     // flipped in a private window: ignore saved settings
  let ownSetting = false; // this site has its own entry, not just the default
  let natural = null;   // how the page looks on its own: "dark" | "light"
  let canvasOnly = false;
  let flipped = false;

  // Flip rules key on an attribute name made up fresh for each page load and
  // are added only to flipped pages, so a page can't probe for Shadeflip with a
  // known name, and the name can't link visits across sites.
  const attr = 'data-' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => String.fromCharCode(97 + n % 26)).join('');
  let css = '';         // flip rules: "" | "asked" | "in"
  let standing = false;
  const opposite = (look) => (look === 'dark' ? 'light' : 'dark');

  // Until the rules are in, an inline filter stands in so the page never
  // shows the wrong color (photos stay inverted for that moment).
  function standIn(on) {
    if (on === standing) return;
    standing = on;
    root.style.setProperty('filter', on ? 'invert(1) hue-rotate(180deg)' : '', on ? 'important' : '');
    if (!on && !root.style.length) root.removeAttribute('style');
    watch.takeRecords(); // our change, not the page switching theme
  }

  function apply() {
    const guess = natural ?? 'light';
    flipped = want !== 'off' && guess !== want;
    if (flipped) root.setAttribute(attr, canvasOnly ? 'canvas' : '');
    else root.removeAttribute(attr);
    if (flipped && !css) {
      css = 'asked';
      api.runtime.sendMessage({ type: 'css', attr }).catch(() => false).then((ok) => {
        css = ok ? 'in' : ''; // failed: the inline filter stays, next flip asks again
        standIn(flipped && !ok);
      });
    }
    standIn(flipped && css !== 'in');
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
      if (ownSetting && !isPrivate) api.storage.local.set({ [CACHE]: look });
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
    ownSetting = SITE in sync;
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
    if (flipped && !root.hasAttribute(attr)) apply();
  }).observe(root, { attributes: true, attributeFilter: [attr] });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !(SITE in changes || 'mode' in changes)) return;
    api.storage.sync.get([SITE, 'mode']).then((s) => {
      ownSetting = SITE in s;
      if (!ownSetting) api.storage.local.remove(CACHE);
      else if (natural && !isPrivate) api.storage.local.set({ [CACHE]: natural });
      if (held) return;
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
      held = isPrivate;
      if (!isPrivate) {
        api.storage.sync.set({ [SITE]: want }).catch(() => {
          // Full list (512 items) or too many changes a minute.
          api.runtime.sendMessage({ type: 'state', host, want, unsaved: true }).catch(() => {});
        });
      }
      sendResponse(want);
    });
    return true; // async response
  });
})();
