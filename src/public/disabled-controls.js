"use strict";
// Keep explanations reachable by keyboard even when a native form control is disabled.
globalThis.UnqlockDisabled = (() => {
  let sequence = 0;
  const records = new WeakMap();
  function set(control, reason) {
    let record = records.get(control);
    if (!record && reason) {
      const label = control.getAttribute('aria-label') || control.labels?.[0]?.textContent.trim() || control.textContent.trim();
      const radioLabel = control.type === 'radio' && control.closest('label');
      const wrapper = radioLabel || document.createElement('span');
      wrapper.classList.add('disabled-explanation');
      if (!radioLabel) { control.before(wrapper); wrapper.append(control); }
      const hint = document.createElement('span');
      hint.id = 'unqlock-disabled-' + ++sequence;
      hint.className = 'disabled-hint';
      hint.setAttribute('role', 'tooltip');
      // Referenced descriptions remain available without becoming part of a parent label's name.
      hint.setAttribute('aria-hidden', 'true');
      wrapper.append(hint);
      const placeHint = () => requestAnimationFrame(() => {
        const viewport = Math.min(innerWidth, document.body.clientWidth);
        hint.style.width = Math.min(240, viewport - 24) + 'px';
        const rect = wrapper.getBoundingClientRect();
        hint.style.left = Math.max(12, Math.min(rect.left, viewport - hint.offsetWidth - 12)) + 'px';
        const above = rect.top - hint.offsetHeight - 6;
        hint.style.top = Math.max(8, above >= 8 ? above : Math.min(rect.bottom + 6, innerHeight - hint.offsetHeight - 8)) + 'px';
      });
      wrapper.addEventListener('mouseenter', placeHint);
      wrapper.addEventListener('focusin', placeHint);
      record = { wrapper, hint, label };
      records.set(control, record);
    }
    control.disabled = Boolean(reason);
    if (!record) return;
    record.hint.textContent = reason || '';
    record.wrapper.classList.toggle('has-reason', Boolean(reason));
    if (reason) {
      record.wrapper.tabIndex = 0;
      record.wrapper.setAttribute('aria-describedby', record.hint.id);
      record.wrapper.setAttribute('aria-label', 'Why ' + record.label + ' is unavailable');
    } else {
      record.wrapper.removeAttribute('tabindex');
      record.wrapper.removeAttribute('aria-describedby');
      record.wrapper.removeAttribute('aria-label');
    }
  }
  return { set };
})();
