# Shadeflip

Dark or Light, remembered per site. Click the toolbar button (or press
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>, <kbd>⌥⇧D</kbd> on a Mac) and the
current site flips. Every other site stays exactly as it was.

- **Per site.** Each exact hostname keeps its own choice (`mail.example.com` and
  `news.example.com` are separate).
- **Leaves matching sites alone.** If a site is already dark and you asked for
  Dark, nothing happens.
- **Tiny.** Under 20 KB, plain JavaScript, no dependencies, no build step, no
  tracking, no popups, no nagging.

## How it works

Pages are flipped with a CSS filter (`invert(1) hue-rotate(180deg)`) on the
page, and images, video, canvases and iframes are flipped back so they look
normal. On load, Shadeflip measures the page's real background colour; if it
already matches your choice for that site, the page is left untouched.

## Settings

Right-click the toolbar button and choose **Options** (Chrome) or
**Shadeflip settings** (Firefox). There you can set:

- **Everywhere else:** Off (default), Dark everywhere, or Light everywhere, for
  sites you haven't set.
- **Sites:** every site you've flipped, with Dark / Light / Off. A site's own
  choice always beats the "everywhere else" setting.
- **Shortcut:** a link to change it. Dark Reader uses the same default
  shortcut, so turn Dark Reader off or rebind one of them.

## Install

- **Chrome, Edge, Brave and other Chromium browsers:** from the
  [Chrome Web Store](https://chromewebstore.google.com/detail/shadeflip/nbdfmpknchaboakjefemnlkfffjohkjk).
- **Firefox (desktop and Android):** from Firefox Add-ons, once the listing is
  approved.
- **Any browser, manually:** download `shadeflip-<version>.zip` from
  [Releases](https://github.com/nxame/shadeflip/releases), unzip it, and follow
  the steps below.

## Releasing

Bump `version` in `manifest.json`, merge to `main`, then push a matching tag:

```sh
git tag v1.0.2 && git push origin v1.0.2
```

The Release workflow lints the extension, builds `shadeflip-<version>.zip` and
publishes a GitHub Release with it. Upload the same zip to Firefox Add-ons and the Chrome Web Store.

## Try it locally

### Firefox (140 or newer)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. Pin the Shadeflip button from the puzzle-piece menu if it isn't shown.

Temporary add-ons are removed when Firefox quits; repeat step 2 next time.

### Chrome, Edge, Brave, Vivaldi, Opera, Arc

1. Open `chrome://extensions` (or `edge://extensions`, etc.).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Pin Shadeflip from the puzzle-piece menu.

Tabs that were open before installing need a reload to pick up saved choices
automatically; clicking the button works on them straight away.

Extensions can't change browser pages (settings, extension stores, the new
tab page), so the button does nothing there.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Manifest V3, shared by Firefox and Chromium browsers |
| `content.js` | Detects page brightness, applies the saved choice, handles flips |
| `flip.css` | The invert filter, active only while `<html data-shadeflip>` is set (the attribute name is swapped for a random one on each page load) |
| `background.js` | Toolbar click and shortcut, toolbar tooltip, adds `flip.css` to pages being flipped |
| `options.html`, `options.js` | Settings page |
| `icons/` | Toolbar and store icons (`icon.svg` is the source) |

Settings live in `storage.sync` (one key per site, `s:<hostname>`, plus
`mode`); for sites with their own setting, the last detected brightness is
cached in `storage.local` so the flip can be applied before the page finishes
loading. Sites without a setting leave nothing behind. Flips made in
private windows last for the tab and are never saved.

`flip.css` isn't added to every page. When a page needs flipping, the content
script makes up a random attribute name for that page load, sets it on
`<html>` and asks the background to add the flip rules with that name. Until they land, an inline filter stands in so the page doesn't
flash. This keeps pages from detecting Shadeflip by setting a known attribute, and a
new name per page means the name can't link visits across sites.
