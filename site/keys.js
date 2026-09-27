// Show the shortcut with Mac key names on Apple devices.
(() => {
  const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (!/mac|iphone|ipad/i.test(p)) return;
  for (const el of document.querySelectorAll('.alt-key')) {
    el.innerHTML = '<kbd>⌥ Option</kbd>+<kbd>⇧ Shift</kbd>+<kbd>D</kbd>';
  }
})();
