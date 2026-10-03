(() => {
  "use strict";
  const extensionAPI = typeof browser !== "undefined" ? browser : chrome;
  const toolbarSelector = '[role="toolbar"][aria-label="Editing toolbar"]';
  const builder = () => location.pathname.startsWith("/ide/builder/");
  let settings = UnqlockToolbar.settings();
  let scheduled = false;
  let clicks = [];
  let stopped = false;
  let route = location.pathname;
  // Only an always-visible search needs to watch the page; Unqork's default costs nothing.
  const observer = new MutationObserver(schedule);

  // While the field is always visible, Close search and Escape clear the text instead of closing it.
  // The native value setter bypasses React's value tracker, so the input event reaches its onChange.
  function clearSearch(input) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles:true }));
  }
  function alwaysSearch(target) {
    return settings.search === "always" && !stopped && builder() && target.closest?.(toolbarSelector);
  }
  // Capture on window runs before React's listeners on its root, so Unqork never sees the close.
  window.addEventListener("click", event => {
    const close = event.target.closest?.('button[aria-label="Close search"]');
    if (!close || !alwaysSearch(close)) return;
    const input = close.closest('[data-slot="input-group"]')?.querySelector('input[aria-label="Search configuration"]');
    if (!input) return;
    event.preventDefault();
    event.stopPropagation();
    clearSearch(input);
    input.focus();
  }, true);
  window.addEventListener("keydown", event => {
    const input = event.target;
    if (event.key !== "Escape" || event.isComposing || !input.matches?.('input[aria-label="Search configuration"]') || !alwaysSearch(input)) return;
    event.preventDefault();
    event.stopPropagation();
    // Escape on an empty field leaves it, as closing would have.
    if (input.value) clearSearch(input);
    else input.blur();
  }, true);

  // Unqork focuses the field it opens; give focus back to whatever had it, or to nothing.
  function restoreFocus(toolbar, previous) {
    const input = toolbar.querySelector('input[aria-label="Search configuration"]');
    if (!input || document.activeElement !== input || previous === input) return;
    if (previous && previous !== document.body && previous.isConnected) previous.focus({ preventScroll:true });
    else input.blur();
  }

  function openSearch(toolbar, button) {
    const now = Date.now();
    clicks = clicks.filter(time => now - time < 2000);
    // A field that never opens must not turn into a click loop; fall back to Unqork's button
    // until the next module or settings change.
    if (clicks.length >= 6) { stopped = true; return; }
    clicks.push(now);
    const previous = document.activeElement;
    button.click();
    restoreFocus(toolbar, previous);
    // The field may take focus after it mounts; check once more on the next frame.
    requestAnimationFrame(() => restoreFocus(toolbar, previous));
  }

  function render() {
    scheduled = false;
    if (route !== location.pathname) {
      route = location.pathname;
      stopped = false;
      clicks = [];
    }
    if (!builder() || settings.search !== "always" || stopped) return;
    for (const toolbar of document.querySelectorAll(toolbarSelector)) {
      const button = toolbar.querySelector('button[aria-label="Search configuration"]');
      if (button) openSearch(toolbar, button);
    }
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(render);
    }
  }

  function apply(value) {
    settings = UnqlockToolbar.settings(value);
    stopped = false;
    clicks = [];
    // canvas-toolbar-bridge.js runs in MAIN and reads this attribute to show the sort switches.
    document.documentElement.setAttribute("data-unqlock-sort-mode", settings.sort);
    observer.disconnect();
    if (settings.search === "always") observer.observe(document.body, { childList:true, subtree:true });
    schedule();
  }

  extensionAPI.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.canvasToolbar) apply(changes.canvasToolbar.newValue);
  });
  extensionAPI.storage.local.get("canvasToolbar").then(result => apply(result.canvasToolbar)).catch(() => apply());
})();
