(() => {
  "use strict";
  const extensionAPI = typeof browser !== "undefined" ? browser : chrome;
  const components = [
  {
    "type": "selectboxes",
    "label": "Checkboxes",
    "group": "Primary Fields",
    "icon": "list-checks",
    "family": "inputs"
  },
  {
    "type": "dateinput",
    "label": "Date Input",
    "group": "Primary Fields",
    "icon": "calendar",
    "family": "inputs"
  },
  {
    "type": "basicDropdown",
    "label": "Dropdown",
    "group": "Primary Fields",
    "icon": "square-chevron-down",
    "family": "inputs"
  },
  {
    "type": "select",
    "label": "Multi-Select Dropdown",
    "group": "Primary Fields",
    "icon": "chevron-down",
    "family": "inputs"
  },
  {
    "type": "number",
    "label": "Number",
    "group": "Primary Fields",
    "icon": "hash",
    "family": "inputs"
  },
  {
    "type": "radio",
    "label": "Radio Buttons",
    "group": "Primary Fields",
    "icon": "circle-dot",
    "family": "inputs"
  },
  {
    "type": "checkboxv2",
    "label": "Single Checkbox",
    "group": "Primary Fields",
    "icon": "square-check-big",
    "family": "inputs"
  },
  {
    "type": "textarea",
    "label": "Text Area",
    "group": "Primary Fields",
    "icon": "text-align-start",
    "family": "inputs"
  },
  {
    "type": "textfield",
    "label": "Text Field",
    "group": "Primary Fields",
    "icon": "type",
    "family": "inputs"
  },
  {
    "type": "address",
    "label": "Address",
    "group": "Secondary Fields",
    "icon": "map-pin",
    "deprecated": true,
    "family": "identity"
  },
  {
    "type": "addressv2",
    "label": "Address Search",
    "group": "Secondary Fields",
    "icon": "map-pin",
    "family": "identity"
  },
  {
    "type": "button",
    "label": "Button",
    "group": "Secondary Fields",
    "icon": "mouse-pointer-click",
    "family": "actions"
  },
  {
    "type": "email",
    "label": "Email",
    "group": "Secondary Fields",
    "icon": "mail",
    "family": "identity"
  },
  {
    "type": "hidden",
    "label": "Hidden",
    "group": "Secondary Fields",
    "icon": "eye-off",
    "family": "private"
  },
  {
    "type": "phonenumber-v2",
    "label": "Intl Phone Number",
    "group": "Secondary Fields",
    "icon": "phone",
    "family": "identity"
  },
  {
    "type": "phoneNumber",
    "label": "Phone Number",
    "group": "Secondary Fields",
    "icon": "phone",
    "family": "identity"
  },
  {
    "type": "password",
    "label": "Protected Field",
    "group": "Secondary Fields",
    "icon": "lock",
    "family": "private"
  },
  {
    "type": "signature",
    "label": "Signature",
    "group": "Secondary Fields",
    "icon": "pen-tool",
    "family": "identity"
  },
  {
    "type": "dataviewer",
    "label": "Advanced Data Grid",
    "group": "Display & Layout",
    "icon": "table",
    "family": "layout"
  },
  {
    "type": "columns",
    "label": "Columns",
    "group": "Display & Layout",
    "icon": "columns-2",
    "family": "layout"
  },
  {
    "type": "content",
    "label": "Content",
    "group": "Display & Layout",
    "icon": "file-text",
    "family": "content"
  },
  {
    "type": "datagrid",
    "label": "Data Grid",
    "group": "Display & Layout",
    "icon": "table",
    "family": "layout"
  },
  {
    "type": "dynamicGrid",
    "label": "Dynamic Grid",
    "group": "Display & Layout",
    "icon": "layout-grid",
    "family": "layout"
  },
  {
    "type": "field-group",
    "label": "Field Group",
    "group": "Display & Layout",
    "icon": "group",
    "family": "layout"
  },
  {
    "type": "freeFormGrid",
    "label": "Freeform Grid",
    "group": "Display & Layout",
    "icon": "layout-grid",
    "family": "layout"
  },
  {
    "type": "htmlelement",
    "label": "HTML Element",
    "group": "Display & Layout",
    "icon": "code",
    "family": "content"
  },
  {
    "type": "markdown",
    "label": "Markdown",
    "group": "Display & Layout",
    "icon": "text-align-start",
    "family": "content"
  },
  {
    "type": "survey",
    "label": "Matrix",
    "group": "Display & Layout",
    "icon": "grid-3x3",
    "family": "layout"
  },
  {
    "type": "navigation",
    "label": "Navigation",
    "group": "Display & Layout",
    "icon": "navigation",
    "family": "actions"
  },
  {
    "type": "panel",
    "label": "Panel",
    "group": "Display & Layout",
    "icon": "panel-top",
    "family": "layout"
  },
  {
    "type": "repeater",
    "label": "Repeater",
    "group": "Display & Layout",
    "icon": "copy-plus",
    "family": "layout"
  },
  {
    "type": "richtexteditor",
    "label": "Rich Text Editor",
    "group": "Display & Layout",
    "icon": "text-align-start",
    "family": "content"
  },
  {
    "type": "table",
    "label": "Table",
    "group": "Display & Layout",
    "icon": "table",
    "family": "layout"
  },
  {
    "type": "inlineGrid",
    "label": "Uniform Grid",
    "group": "Display & Layout",
    "icon": "grid-3x3",
    "family": "layout"
  },
  {
    "type": "viewgrid",
    "label": "View Grid",
    "group": "Display & Layout",
    "icon": "layout-grid",
    "family": "layout"
  },
  {
    "type": "browserStorage",
    "label": "Browser Storage",
    "group": "Data & Event Processing",
    "icon": "hard-drive",
    "family": "data"
  },
  {
    "type": "transformer",
    "label": "Calculator",
    "group": "Data & Event Processing",
    "icon": "calculator",
    "family": "logic"
  },
  {
    "type": "checkpoint",
    "label": "Checkpoint",
    "group": "Data & Event Processing",
    "icon": "flag",
    "family": "actions"
  },
  {
    "type": "datamapper",
    "label": "Data Mapper",
    "group": "Data & Event Processing",
    "icon": "arrow-right-left",
    "family": "logic"
  },
  {
    "type": "infotable",
    "label": "Data Table",
    "group": "Data & Event Processing",
    "icon": "database",
    "family": "data"
  },
  {
    "type": "dataworkflow",
    "label": "Data Workflow",
    "group": "Data & Event Processing",
    "icon": "workflow",
    "family": "logic"
  },
  {
    "type": "decision",
    "label": "Decisions",
    "group": "Data & Event Processing",
    "icon": "git-branch",
    "family": "decisions"
  },
  {
    "type": "file",
    "label": "File",
    "group": "Data & Event Processing",
    "icon": "file-up",
    "family": "data"
  },
  {
    "type": "filestorage",
    "label": "File Storage",
    "group": "Data & Event Processing",
    "icon": "folder",
    "family": "data"
  },
  {
    "type": "initializer",
    "label": "Initializer",
    "group": "Data & Event Processing",
    "icon": "play",
    "family": "actions"
  },
  {
    "type": "plaid",
    "label": "Plaid",
    "group": "Data & Event Processing",
    "icon": "landmark",
    "family": "integrations"
  },
  {
    "type": "integrator",
    "label": "Plug-In",
    "group": "Data & Event Processing",
    "icon": "plug",
    "family": "integrations"
  },
  {
    "type": "timer",
    "label": "Timer",
    "group": "Data & Event Processing",
    "icon": "timer",
    "family": "actions"
  },
  {
    "type": "chart",
    "label": "Chart",
    "group": "Charts & Graphs",
    "icon": "chart-column",
    "family": "charts"
  },
  {
    "type": "kpi",
    "label": "KPI",
    "group": "Charts & Graphs",
    "icon": "gauge",
    "family": "charts"
  },
  {
    "type": "map",
    "label": "Map",
    "group": "Charts & Graphs",
    "icon": "map",
    "family": "charts"
  },
  {
    "type": "mapv2",
    "label": "Map V2",
    "group": "Charts & Graphs",
    "icon": "map",
    "family": "charts"
  }
];
  const defaults = { enabled: true, tray: true, canvas: true, icons: true, tiles: true, trayLabels: false, accents: false, backgrounds: false, borders: false, labels: true, symbols: true, compact: false, containerSpacing: false, containerHeaders: false, containerGuides: false, containerDepth: false, containerSticky: false, containerEnd: false };
  const normalize = value => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const byType = new Map(components.map(component => [component.type, component]));
  const byLabel = new Map(components.map(component => [normalize(component.label), component]));
  const selector = "[data-tray-type], [data-component-key]";
  let settings = { ...defaults };
  let layout = UnqlockRowLayout.settings();
  let decorated = new Map();
  let scheduled = false;
  const containers = ["containerSpacing", "containerHeaders", "containerGuides", "containerDepth", "containerSticky", "containerEnd"];
  const contentSelector = '[data-slot="collapsible-content"]';

  function reconcile(next) {
    for (const [element, attributes] of decorated) {
      for (const name of Object.keys(attributes)) {
        if (!Object.hasOwn(next.get(element) || {}, name)) element.removeAttribute(name);
      }
    }
    for (const [element, attributes] of next) {
      for (const [name, value] of Object.entries(attributes)) {
        if (element.getAttribute(name) !== value) element.setAttribute(name, value);
      }
    }
    decorated = next;
  }

  // Sticky pins to the nearest scroll container; a clipping box that does not scroll,
  // such as a Columns cell, would pin the header inside itself instead of the canvas.
  function clipped(element) {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll") return false;
      if (overflowY === "hidden") return true;
    }
    return false;
  }

  // A container's frame sits between its collapsible root and its trigger. Read-only
  // modules, such as imports, drop the drag attributes, so match structure instead.
  function frameOf(card) {
    const frame = card.matches('[data-slot="collapsible-trigger"]') ? card.parentElement : null;
    return frame?.parentElement?.matches('[data-slot="collapsible"]') ? frame : null;
  }

  // The tree view shows the type as a badge. The By Type and alphabetical views render
  // flat rows whose details line reads "in parent • Type", so the type is its last item.
  function typeLabel(card, owned) {
    const badge = [...card.querySelectorAll(".text-2xs")].find(owned);
    if (badge) return badge;
    const details = [...card.querySelectorAll(".text-xs")].find(owned);
    const last = details?.lastElementChild;
    if (!last || last.children.length) return null;
    return details.children.length === 1 || last.previousElementSibling?.textContent.trim() === "•" ? last : null;
  }

  function render() {
    scheduled = false;
    const next = new Map();
    const mark = (element, attributes) => {
      if (element) next.set(element, { ...next.get(element), ...attributes });
    };
    const hasEffects = settings.compact || settings.icons || settings.tiles || settings.trayLabels || settings.labels || settings.accents || settings.backgrounds || settings.borders || layout.enabled || containers.some(key => settings[key]);
    if (settings.enabled && hasEffects && location.pathname.startsWith("/ide/builder/")) {
      for (const card of document.querySelectorAll(selector)) {
        const isTray = card.hasAttribute("data-tray-type");
        if (!(isTray ? settings.tray : settings.canvas)) continue;
        const owned = element => element.closest(selector) === card;
        const icon = [...card.querySelectorAll("svg")].find(owned);
        if (!icon) continue;
        const label = isTray ? null : typeLabel(card, owned);
        if (settings.compact) {
          if (isTray) {
            mark(card, { "data-uq-compact": "tray" });
            mark(icon, { "data-uq-compact-icon": "" });
          } else {
            const tile = icon.parentElement;
            const header = tile?.parentElement;
            const identity = label?.parentElement;
            // Only compress the owned header; never the nested group contents.
            if (header && owned(header) && identity?.parentElement === header && identity !== tile && identity.firstElementChild !== label) {
              mark(card, { "data-uq-compact": "canvas" });
              mark(header, { "data-uq-compact-header": "" });
              mark(tile, { "data-uq-compact-tile": "" });
              mark(icon, { "data-uq-compact-icon": "" });
              mark(identity, { "data-uq-compact-identity": "" });
              mark(identity.firstElementChild, { "data-uq-compact-name": "" });
              mark(label, { "data-uq-compact-type": "" });
            }
          }
        }
        if (!isTray && layout.enabled) {
          const tile = icon.parentElement;
          const header = tile?.parentElement;
          const identity = label?.parentElement;
          const trailing = header && [...header.children].find(child => child !== tile && child !== identity && child.querySelector(':scope > button[data-slot="dropdown-menu-trigger"]'));
          // Reorder only a fully recognized header; anything else keeps Unqork's layout.
          if (trailing && identity && owned(header) && header.children.length === 3 && identity.parentElement === header && identity.children.length === 2 && identity.lastElementChild === label) {
            const place = (element, section) => mark(element, { "data-uq-section": section, "data-uq-slot": layout[section] });
            mark(header, { "data-uq-row-layout": "" });
            mark(identity, { "data-uq-row-contents": "identity" });
            mark(trailing, { "data-uq-row-contents": "" });
            place(tile, "icon");
            place(identity.firstElementChild, "name");
            place(label, "type");
            for (const child of trailing.children) {
              if (child.matches('button[data-slot="dropdown-menu-trigger"]')) place(child, "actions");
              else if (child.matches('svg[class*="chevron"]')) mark(child, { "data-uq-section": "chevron" });
              // The dependency count and the unsaved-changes dot travel together.
              else place(child, "chip");
            }
          }
        }
        const component = isTray ? byType.get(card.getAttribute("data-tray-type")) : byLabel.get(normalize(label?.textContent || ""));
        // Every collapsible canvas component shares this structure, whatever its type.
        const container = isTray ? null : frameOf(card);
        if (container && containers.some(key => settings[key])) {
          const content = card.nextElementSibling?.matches(contentSelector) ? card.nextElementSibling : null;
          // Collapsed containers may unmount their content; header effects still apply.
          const body = content?.firstElementChild;
          const wrapper = container.parentElement?.matches('[data-slot="collapsible"]') ? container.parentElement.parentElement : null;
          let depth = 0;
          for (let node = container.parentElement?.closest(contentSelector); node; node = node.parentElement?.closest(contentSelector)) {
            if (node.previousElementSibling?.matches('[data-slot="collapsible-trigger"][data-component-key]')) depth++;
          }
          mark(container, { "data-uq-container": "", ...(component ? { "data-uq-family": component.family } : {}) });
          if (settings.containerSpacing) {
            mark(wrapper, { "data-uq-container-spacing": "" });
            mark(body, { "data-uq-container-body-spacing": "" });
          }
          if (settings.containerHeaders) mark(card, { "data-uq-container-header": "" });
          if (settings.containerSticky && !clipped(container)) mark(card, { "data-uq-container-sticky": "", "data-uq-depth": String(Math.min(depth, 8)) });
          if (settings.containerGuides) mark(body, { "data-uq-container-guide": "" });
          if (settings.containerDepth) mark(body, { "data-uq-container-shade": String(Math.min(depth, 3)) });
          if (settings.containerEnd) mark(body, { "data-uq-container-end": card.getAttribute("data-component-key") });
        }
        if (!component) continue;
        mark(card, { "data-uq-family": component.family, "data-uq-surface": isTray ? "tray" : "canvas" });
        if (settings.icons) mark(icon, { "data-uq-icon": "", ...(settings.symbols ? { "data-uq-symbol": component.type } : {}) });
        if (settings.tiles) {
          if (isTray) mark(icon, { "data-uq-icon-background": "" });
          else if (icon.parentElement !== card) mark(icon.parentElement, { "data-uq-tile": "" });
        }
        if (isTray && settings.trayLabels) {
          const name = [...card.querySelectorAll('span[data-slot="tooltip-trigger"]')].find(owned);
          if (name) mark(name, { "data-uq-label": "" });
        }
        if (settings.labels && label) mark(label, { "data-uq-label": "" });
        if (settings.accents) mark(card, { "data-uq-accent": "" });
        const frame = frameOf(card) || card;
        if (settings.backgrounds || settings.borders) mark(frame, { "data-uq-family": component.family });
        if (settings.backgrounds) mark(frame, { "data-uq-background": "" });
        if (settings.borders) mark(frame, { "data-uq-border": "" });
      }
    }
    reconcile(next);
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(render);
    }
  }

  function applySettings(value) {
    settings = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof value?.[key] === "boolean" ? value[key] : fallback]));
    schedule();
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-tray-type", "data-component-key", "class"] });
  window.addEventListener("popstate", schedule);
  function applyLayout(value) {
    layout = UnqlockRowLayout.settings(value);
    schedule();
  }

  extensionAPI.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.rowLayout) applyLayout(changes.rowLayout.newValue);
    if (changes.appearance) applySettings(changes.appearance.newValue);
  });
  extensionAPI.storage.local.get(["appearance", "rowLayout"]).then(result => { layout = UnqlockRowLayout.settings(result.rowLayout); applySettings(result.appearance); }).catch(() => applySettings(defaults));
})();
