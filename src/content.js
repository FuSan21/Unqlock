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
    "family": "inputs"
  },
  {
    "type": "addressv2",
    "label": "Address Search",
    "group": "Secondary Fields",
    "icon": "map-pin",
    "family": "inputs"
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
    "family": "inputs"
  },
  {
    "type": "hidden",
    "label": "Hidden",
    "group": "Secondary Fields",
    "icon": "eye-off",
    "family": "data"
  },
  {
    "type": "phonenumber-v2",
    "label": "Intl Phone Number",
    "group": "Secondary Fields",
    "icon": "phone",
    "family": "inputs"
  },
  {
    "type": "phoneNumber",
    "label": "Phone Number",
    "group": "Secondary Fields",
    "icon": "phone",
    "family": "inputs"
  },
  {
    "type": "password",
    "label": "Protected Field",
    "group": "Secondary Fields",
    "icon": "lock",
    "family": "inputs"
  },
  {
    "type": "signature",
    "label": "Signature",
    "group": "Secondary Fields",
    "icon": "pen-tool",
    "family": "inputs"
  },
  {
    "type": "dataviewer",
    "label": "Advanced Data Grid",
    "group": "Display & Layout",
    "icon": "table",
    "family": "grids"
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
    "family": "grids"
  },
  {
    "type": "dynamicGrid",
    "label": "Dynamic Grid",
    "group": "Display & Layout",
    "icon": "layout-grid",
    "family": "grids"
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
    "family": "grids"
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
    "family": "grids"
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
    "family": "inputs"
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
    "family": "grids"
  },
  {
    "type": "viewgrid",
    "label": "View Grid",
    "group": "Display & Layout",
    "icon": "layout-grid",
    "family": "grids"
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
    "family": "data"
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
    "family": "logic"
  },
  {
    "type": "file",
    "label": "File",
    "group": "Data & Event Processing",
    "icon": "file-up",
    "family": "inputs"
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
    "family": "logic"
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
    "family": "logic"
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
  },
  {
    "type": "aiSummarizer",
    "label": "AI Summarizer",
    "group": "Agentic Pallet",
    "icon": "sparkles",
    "family": "logic"
  },
  {
    "type": "uiBlock",
    "label": "Simple Grid",
    "group": "Display & Layout",
    "icon": "puzzle",
    "family": "grids"
  }
];
  const defaults = { enabled: true, tray: true, canvas: true, icons: true, tiles: true, trayLabels: false, accents: false, backgrounds: false, borders: false, labels: true, symbols: true, compact: false, containerSpacing: false, containerHeaders: false, containerGuides: false, containerDepth: false, containerSticky: false, containerEnd: false };
  const normalize = value => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const byType = new Map(components.map(component => [component.type, component]));
  const byLabel = new Map(components.map(component => [normalize(component.label), component]));
  // Custom components (BYOC) carry their own names, so they share one group.
  const custom = { type:"custom", family:"custom" };
  // Distinct icon shapes, drawn in their group's color. The stroke color is filled in from the palette.
  const symbols = {
    "addressv2": "<path d=\"M15 10c0 4-5 8-5 8s-5-4-5-8a5 5 0 0 1 10 0Z\"/><circle cx=\"10\" cy=\"10\" r=\"1.5\"/><circle cx=\"17\" cy=\"17\" r=\"3\"/><path d=\"m19 19 3 3\"/>",
    "phonenumber-v2": "<path d=\"M8 3H4v4c0 7 6 13 13 13h4v-4l-5-1-2 2-7-7 2-2Z\"/><circle cx=\"17\" cy=\"6\" r=\"4\"/><path d=\"M13 6h8M17 2c-2 2-2 6 0 8 2-2 2-6 0-8\"/>",
    "dataviewer": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M9 9v12M13 13h5m-5 4h5\"/><circle cx=\"15\" cy=\"13\" r=\"1\"/><circle cx=\"17\" cy=\"17\" r=\"1\"/>",
    "datagrid": "<path d=\"M10 21H3V3h18v7M3 9h18M9 9v12M3 15h7\"/><path d=\"m13 18 7-7 3 3-7 7-4 1Z\"/>",
    "dynamicGrid": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><path d=\"M3 15h17l-3-3m3 3-3 3M21 21H4l3-3\"/>",
    "freeFormGrid": "<rect x=\"3\" y=\"3\" width=\"11\" height=\"7\" rx=\"1\"/><rect x=\"18\" y=\"3\" width=\"3\" height=\"12\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"19\" width=\"7\" height=\"2\" rx=\"1\"/>",
    "viewgrid": "<path d=\"M3 10V3h18v7M9 3v7M15 3v7\"/><path d=\"M2 16s4-5 10-5 10 5 10 5-4 5-10 5S2 16 2 16Z\"/><circle cx=\"12\" cy=\"16\" r=\"2\"/>",
    "markdown": "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M5 15V9l3 3 3-3v6M17 9v6m-2-2 2 2 2-2\"/>",
    "richtexteditor": "<path d=\"M4 4h7a3 3 0 0 1 0 6H4Zm0 6h8a3 3 0 0 1 0 6H4ZM3 21h7m3-3 6-6 3 3-6 6-4 1Z\"/>",
    "survey": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M9 3v18\"/><circle cx=\"13\" cy=\"13\" r=\"1\"/><circle cx=\"18\" cy=\"18\" r=\"1\"/><circle cx=\"13\" cy=\"18\" r=\"1\"/>",
    "mapv2": "<path d=\"m3 6 6-3 5 3v15l-5-3-6 3Zm6-3v15M18 12s4-4 4-7a4 4 0 0 0-8 0c0 3 4 7 4 7Z\"/><circle cx=\"18\" cy=\"5\" r=\"1\"/><path d=\"m17 17 4-2v6\"/>",
    "select": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"5\" rx=\"1\"/><rect x=\"13\" y=\"3\" width=\"8\" height=\"5\" rx=\"1\"/><path d=\"M3 12h18M7 16l5 5 5-5\"/>"
  };
  const glyph = (markup, color) => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + markup + '</svg>') + '")';
  // Colors reach content.css as variables on the root element. Setting them through the CSSOM
  // works under the builder's content security policy, which an injected stylesheet might not.
  function applyColors(value) {
    const root = document.documentElement.style;
    const palette = UnqlockColors.palette(value);
    for (const family of palette) {
      for (const [prefix, [ink, tint]] of [["--uq-" + family.id, family.light], ["--uq-" + family.id + "-dark", family.dark]]) {
        root.setProperty(prefix + "-ink", ink);
        root.setProperty(prefix + "-tint", tint);
      }
    }
    for (const [type, markup] of Object.entries(symbols)) {
      const family = palette.find(entry => entry.id === byType.get(type).family);
      root.setProperty("--uq-symbol-" + type, glyph(markup, family.light[0]));
      root.setProperty("--uq-symbol-" + type + "-dark", glyph(markup, family.dark[0]));
    }
  }
  applyColors();
  // UI blocks such as Simple Grid have a per-environment ID in their type, so match them by name.
  function trayComponent(card) {
    const type = card.getAttribute("data-tray-type");
    if (type.startsWith("byoc::")) return custom;
    if (!type.startsWith("uiBlock::")) return byType.get(type);
    const block = byLabel.get(normalize(card.getAttribute("aria-label")?.replace(/ component$/, "") || ""));
    return block?.type === "uiBlock" ? block : undefined;
  }
  // On the canvas a custom component shows its own name as the type, with a package icon.
  function canvasComponent(label, icon) {
    if (icon.matches(".lucide-package") && label) return custom;
    return byLabel.get(normalize(label?.textContent || ""));
  }
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
  // Nested containers share ancestors, so one pass remembers each ancestor's answer.
  function clipped(element, seen) {
    const path = [];
    let result = false;
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (seen.has(node)) { result = seen.get(node); break; }
      path.push(node);
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll") break;
      if (overflowY === "hidden") { result = true; break; }
    }
    for (const node of path) seen.set(node, result);
    return result;
  }

  // A card's own element is almost always its first match; scan further only when a
  // nested card comes first.
  function ownedMatch(card, query, owned) {
    const first = card.querySelector(query);
    return first && owned(first) ? first : [...card.querySelectorAll(query)].find(owned);
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
    const badge = ownedMatch(card, ".text-2xs", owned);
    if (badge) return badge;
    const details = ownedMatch(card, ".text-xs", owned);
    const last = details?.lastElementChild;
    if (!last || last.children.length) return null;
    return details.children.length === 1 || last.previousElementSibling?.textContent.trim() === "•" ? last : null;
  }

  function render() {
    scheduled = false;
    const next = new Map();
    const clipping = new Map();
    const mark = (element, attributes) => {
      if (element) next.set(element, { ...next.get(element), ...attributes });
    };
    const hasEffects = settings.compact || settings.icons || settings.tiles || settings.trayLabels || settings.labels || settings.accents || settings.backgrounds || settings.borders || layout.enabled || containers.some(key => settings[key]);
    if (settings.enabled && hasEffects && location.pathname.startsWith("/ide/builder/")) {
      for (const card of document.querySelectorAll(selector)) {
        const isTray = card.hasAttribute("data-tray-type");
        if (!(isTray ? settings.tray : settings.canvas)) continue;
        const owned = element => element.closest(selector) === card;
        const icon = ownedMatch(card, "svg", owned);
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
        const component = isTray ? trayComponent(card) : canvasComponent(label, icon);
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
          if (settings.containerSticky && !clipped(container, clipping)) mark(card, { "data-uq-container-sticky": "", "data-uq-depth": String(Math.min(depth, 8)) });
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
          const name = ownedMatch(card, 'span[data-slot="tooltip-trigger"]', owned);
          if (name) mark(name, { "data-uq-label": "" });
        }
        if (settings.labels && label) mark(label, { "data-uq-label": "" });
        if (settings.accents) mark(card, { "data-uq-accent": "" });
        const frame = frameOf(card) || card;
        if (settings.backgrounds || settings.borders) mark(frame, { "data-uq-family": component.family });
        if (settings.backgrounds) mark(frame, { "data-uq-background": "" });
        if (settings.borders) mark(frame, { "data-uq-border": "" });
        // Unqork's brand-colored dependency chip clashes with a full background; give it the row's colors.
        // Full backgrounds and tinted container headers both put the row's controls on a colored surface.
        if (!isTray && (settings.backgrounds || (settings.containerHeaders && container))) {
          mark(ownedMatch(card, 'button[data-slot="popover-trigger"][aria-label*="dependenc" i]', owned), { "data-uq-chip": "" });
          // Unqork's gray actions menu and container chevron turn muddy on a colored row.
          mark(ownedMatch(card, 'button[data-slot="dropdown-menu-trigger"]', owned), { "data-uq-row-control": "" });
          mark(ownedMatch(card, 'svg[class*="chevron"]', owned), { "data-uq-row-control": "" });
        }
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

  // Only changes that touch sidebar or canvas components, or elements this script marked,
  // need a new pass. The rest of the builder, such as Build Agent replies streaming in or
  // code editors, changes on nearly every frame.
  const touchesCard = node => node.nodeType === 1 && (decorated.has(node) || node.matches(selector) || node.querySelector(selector) !== null);
  function relevant(record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target && (decorated.has(target) || target.closest(selector))) return true;
    for (const node of record.addedNodes) if (touchesCard(node)) return true;
    for (const node of record.removedNodes) if (touchesCard(node)) return true;
    return false;
  }
  // pushState fires no event, so a changed route also counts, to clear marks outside the builder.
  let route = location.pathname;
  const observer = new MutationObserver(records => {
    if (scheduled) return;
    if (route !== location.pathname || records.some(relevant)) {
      route = location.pathname;
      schedule();
    }
  });
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
    if (changes.componentColors) applyColors(changes.componentColors.newValue);
  });
  extensionAPI.storage.local.get(["appearance", "rowLayout", "componentColors"]).then(result => { layout = UnqlockRowLayout.settings(result.rowLayout); applyColors(result.componentColors); applySettings(result.appearance); }).catch(() => applySettings(defaults));
})();
