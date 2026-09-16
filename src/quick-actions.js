"use strict";
async function runQuickAction(request) {
  try {
    if (location.href !== request.url) return { ok:false, message:"Page changed. Reopen Unqlock and try again." };
    if (!['set', 'remove', 'trigger', 'log'].includes(request.action)) return { ok:false, message:"Unknown action." };
    const forms = document.querySelectorAll('.unqorkio-form');
    if (forms.length !== 1 || typeof window.angular?.element !== 'function') return { ok:false, message:"Open a page with one Angular Unqork form. Embedded or multiple forms are not supported." };
    const element = window.angular.element(forms[0]);
    const scope = element.scope();
    const submission = scope?.submission;
    if (!submission?.data || typeof submission.data !== 'object') return { ok:false, message:"No submission data found on this page." };
    if (request.action === 'log') {
      let cache;
      try { cache = element.injector().get('CacheService')?.cache; } catch {}
      if (request.style === 'object') console.log({ submission, cache });
      else {
        console.group('Unqlock · Page data');
        console.log('Submission', submission);
        if (cache !== undefined) console.log('Cache', cache);
        console.groupEnd();
      }
      if (submission.validationErrors?.length) console.warn('Unqlock: validation errors were found.');
      if (submission.integratorErrors && Object.keys(submission.integratorErrors).length) console.warn('Unqlock: integration errors were found.');
      return { ok:true, message:"Logged to the page’s DevTools Console. Data may contain sensitive information." };
    }
    if (request.confirmed !== true) return { ok:false, message:"Confirm that you intend to change or execute this page." };
    const key = request.key;
    if (typeof key !== 'string' || !key.trim() || ['__proto__', 'constructor', 'prototype'].includes(key)) return { ok:false, message:"Enter a valid, non-reserved property or component key." };
    if (request.action === 'trigger') {
      if (typeof window.UnqorkioUtils?.eachComponent !== 'function' || !scope.form) return { ok:false, message:"Component execution is unavailable on this page." };
      const matches = [];
      window.UnqorkioUtils.eachComponent([scope.form], component => {
        if (component.key === key) matches.push(component);
      });
      if (matches.length !== 1 || typeof matches[0].execute !== 'function') return { ok:false, message:"Expected one executable component with that exact key." };
      await matches[0].execute();
      return { ok:true, message:"Component executed. Check the application for its results." };
    }
    if (request.action === 'remove') {
      if (!Object.prototype.hasOwnProperty.call(submission.data, key)) return { ok:false, message:"That property does not exist." };
      if (!Reflect.deleteProperty(submission.data, key)) throw new Error('Delete failed');
      return { ok:true, message:"Property removed from in-memory submission data." };
    }
    let value = request.value;
    if (typeof value !== 'string') return { ok:false, message:"Enter a value." };
    if (request.type === 'number') {
      if (!value.trim() || !Number.isFinite(Number(value))) return { ok:false, message:"Enter a finite number." };
      value = Number(value);
    } else if (request.type === 'object') {
      try { value = JSON.parse(value); } catch { return { ok:false, message:"Enter valid JSON, not JavaScript." }; }
      if (value === null || typeof value !== 'object') return { ok:false, message:"Object values must be a JSON object or array." };
    } else if (request.type !== 'text') return { ok:false, message:"Unknown value type." };
    Object.defineProperty(submission.data, key, { value, writable:true, enumerable:true, configurable:true });
    return { ok:true, message:"Property updated in memory. Unqlock did not save a submission." };
  } catch {
    return { ok:false, message:"The action failed. Check the page console before retrying; it may have partially run." };
  }
}
