(() => {
  'use strict';
  // Replaces Unqork's sort dropdown with switches that call the dropdown's own onSelect.
  // Only a trigger whose React props expose options, selectedValue and onSelect is replaced.
  const triggerSelector = '[role="toolbar"][aria-label="Editing toolbar"] button[aria-label="Sort components"][aria-haspopup="menu"]';
  const groupAttribute = 'data-unqlock-sort';
  const replacedAttribute = 'data-unqlock-sort-replaced';
  const funnel = 'M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z';
  // Each group remembers the trigger and options it was built for.
  const built = new WeakMap();
  let scheduled = false;

  const reactKey = (node, prefix) => Object.keys(node).find(key => key.startsWith(prefix));
  const indexOf = (parent, a, b) => {
    for (let child = parent.child; child; child = child.sibling) {
      if (child === a) return 'a';
      if (child === b) return 'b';
    }
    return '';
  };
  // React keeps two versions of each fiber, and a memoized subtree keeps return pointers to
  // stale ancestors. This mirrors React's findCurrentFiberUsingSlowPath: pair the two
  // versions' ancestors up to the root, which knows its current version.
  function currentFiber(fiber) {
    const alternate = fiber.alternate;
    if (!alternate) return fiber;
    let a = fiber;
    let b = alternate;
    for (let depth = 0; depth < 2000; depth++) {
      const parentA = a.return;
      if (!parentA) break;
      const parentB = parentA.alternate;
      if (!parentB) {
        if (!parentA.return) break;
        a = b = parentA.return;
        continue;
      }
      if (parentA.child === parentB.child) {
        const found = indexOf(parentA, a, b);
        return found === 'a' ? fiber : found === 'b' ? alternate : null;
      }
      if (a.return !== b.return) {
        a = parentA;
        b = parentB;
        continue;
      }
      const inA = indexOf(parentA, a, b);
      const inB = inA ? '' : indexOf(parentB, a, b);
      if (inA === 'a' || inB === 'b') { a = parentA; b = parentB; }
      else if (inA === 'b' || inB === 'a') { a = parentB; b = parentA; }
      else return null;
    }
    // a is now the root fiber, whose container records the current version.
    if (a.tag !== 3 || !a.stateNode) return null;
    return a.stateNode.current === a ? fiber : alternate;
  }
  const validOption = option => option && typeof option === 'object' && ['string', 'number'].includes(typeof option.value) && typeof option.label === 'string' && option.label.length <= 60;
  const valid = props => props && Array.isArray(props.options) && props.options.length >= 2 && props.options.length <= 8
    && props.options.every(validOption) && typeof props.onSelect === 'function' && Object.hasOwn(props, 'selectedValue');

  function sortProps(trigger) {
    const key = reactKey(trigger, '__reactFiber$');
    let fiber = key && trigger[key];
    // Either version of an ancestor identifies the dropdown; only the current one has its latest props.
    for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
      if (valid(fiber.memoizedProps) || valid(fiber.alternate?.memoizedProps)) {
        const props = currentFiber(fiber)?.memoizedProps;
        return valid(props) ? props : null;
      }
    }
    return null;
  }

  function select(trigger, value) {
    try { sortProps(trigger)?.onSelect(value); } catch { /* A changed builder must not break the editor. */ }
    // React may commit the new value without touching the toolbar's DOM, so resync on a timer too.
    schedule();
    for (const delay of [50, 250]) setTimeout(schedule, delay);
  }

  function build(group, trigger, props) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', funnel);
    svg.append(path);
    const buttons = props.options.map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.textContent = option.label;
      button.addEventListener('click', () => select(trigger, option.value));
      return button;
    });
    group.replaceChildren(svg, ...buttons);
  }

  function update(group, trigger, props) {
    const signature = JSON.stringify(props.options.map(option => [option.value, option.label]));
    const previous = built.get(group);
    if (previous?.signature !== signature || previous.trigger !== trigger) {
      build(group, trigger, props);
      built.set(group, { signature, trigger });
    }
    const buttons = [...group.querySelectorAll(':scope > button')];
    // An unknown value checks nothing; the first switch stays reachable by Tab.
    const selected = props.options.findIndex(option => option.value === props.selectedValue);
    buttons.forEach((button, index) => {
      const checked = String(index === selected);
      if (button.getAttribute('aria-checked') !== checked) button.setAttribute('aria-checked', checked);
      const tabIndex = index === Math.max(0, selected) ? 0 : -1;
      if (button.tabIndex !== tabIndex) button.tabIndex = tabIndex;
    });
  }

  function create() {
    const group = document.createElement('div');
    group.setAttribute(groupAttribute, '');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Sort components');
    group.addEventListener('keydown', event => {
      const buttons = [...group.querySelectorAll(':scope > button')];
      const index = buttons.indexOf(event.target);
      const step = { ArrowRight:1, ArrowDown:1, ArrowLeft:-1, ArrowUp:-1 }[event.key];
      if (index < 0 || (!step && event.key !== 'Home' && event.key !== 'End')) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + step + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].click();
    });
    return group;
  }

  function sync() {
    scheduled = false;
    const enabled = document.documentElement.getAttribute('data-unqlock-sort-mode') === 'always' && location.pathname.startsWith('/ide/builder/');
    for (const trigger of document.querySelectorAll(triggerSelector)) {
      const existing = trigger.nextElementSibling?.hasAttribute(groupAttribute) ? trigger.nextElementSibling : null;
      let props = null;
      try { props = enabled ? sortProps(trigger) : null; } catch { props = null; }
      // Any other shape keeps Unqork's dropdown.
      if (!props) {
        existing?.remove();
        trigger.removeAttribute(replacedAttribute);
        continue;
      }
      const group = existing || create();
      if (!existing) trigger.after(group);
      update(group, trigger, props);
      if (!trigger.hasAttribute(replacedAttribute)) trigger.setAttribute(replacedAttribute, '');
    }
    for (const group of document.querySelectorAll('[' + groupAttribute + ']')) {
      if (!enabled || !group.previousElementSibling?.matches(triggerSelector)) group.remove();
    }
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(sync);
    }
  }

  // Only the mode attribute is watched until the switches are on; Unqork's default costs nothing.
  const pageObserver = new MutationObserver(schedule);
  function watch() {
    pageObserver.disconnect();
    if (document.documentElement.getAttribute('data-unqlock-sort-mode') === 'always') pageObserver.observe(document.documentElement, { childList:true, subtree:true });
    schedule();
  }
  new MutationObserver(watch).observe(document.documentElement, { attributes:true, attributeFilter:['data-unqlock-sort-mode'] });
  watch();
})();
