"use strict";
// Shared by the popup and isolated content scripts. No page data is inspected.
globalThis.UnqlockEnvironment = (() => {
  const labels = { staging:'STAGING', qa:'QA', uat:'UAT', preprod:'PRE-PROD', production:'PRODUCTION', unknown:'UNKNOWN' };
  function hostname(value) {
    const host = String(value || '').trim().toLowerCase();
    if (!host || host.length > 253 || !host.includes('.') || !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) {
      throw new Error('Enter a hostname only, without a protocol, port, path or wildcard.');
    }
    return host;
  }
  function settings(value) {
    // Migrate the original single-group settings without losing mappings.
    const raw = value?.groups ?? (value?.hosts ? [{ id:'legacy', name:'My organization', domains:Object.entries(value.hosts).filter(([, host]) => host).map(([environment, host]) => ({ environment, hostname:host })) }] : []);
    if (!Array.isArray(raw) || raw.length > 100) throw new Error('Use up to 100 domain groups.');
    const seen = new Set();
    const ids = new Set();
    const groups = raw.map(group => {
      if (typeof group.id !== 'string' || !group.id || ids.has(group.id)) throw new Error('Each group needs a unique ID.');
      ids.add(group.id);
      const name = String(group.name || '').trim();
      if (!name || name.length > 80) throw new Error('Enter a group name of up to 80 characters.');
      if (!Array.isArray(group.domains) || group.domains.length > 100) throw new Error('Use up to 100 domains per group.');
      const domains = group.domains.map(domain => {
        const host = hostname(domain.hostname);
        if (!Object.hasOwn(labels, domain.environment)) throw new Error('Choose a valid environment.');
        if (seen.has(host)) throw new Error('Each hostname can belong to only one environment and group.');
        seen.add(host);
        return { hostname:host, environment:domain.environment };
      });
      return { id:group.id, name, ...(typeof group.autoKey === 'string' ? { autoKey:group.autoKey } : {}), domains };
    });
    return { badge:value?.badge === true, blockProduction:value?.blockProduction === true, autoDiscover:value?.autoDiscover !== false, groups };
  }
  function detect(url, value) {
    const host = new URL(url).hostname.toLowerCase();
    const config = settings(value);
    const group = config.groups.find(group => group.domains.some(domain => domain.hostname === host));
    const explicit = group?.domains.find(domain => domain.hostname === host);
    if (explicit) return { kind:explicit.environment, label:labels[explicit.environment], host, groupId:group.id, source:'Saved mapping · ' + group.name };
    let kind = 'unknown';
    if (host.endsWith('.unqork.io')) {
      // Express suffix "x" and Creator suffix "-designer" are common variants.
      const name = host.slice(0, -10).replace(/-designer$/, '');
      const tokens = name.replace(/pre-?prod(?:uction)?x?(?=-|$)/g, 'preprod').split('-');
      const aliases = { staging:'staging', stagingx:'staging', qa:'qa', qax:'qa', uat:'uat', uatx:'uat', preprod:'preprod', preprodx:'preprod', prod:'production', prodx:'production', production:'production', productionx:'production' };
      const matches = [...new Set(tokens.map(token => aliases[token]).filter(Boolean))];
      // Never let another token hide a production marker.
      if (matches.includes('production')) kind = 'production';
      else if (matches.length === 1) kind = matches[0];
    }
    return { kind, label:labels[kind], host, source:kind === 'unknown' ? 'Map this hostname to identify it' : 'Inferred from hostname' };
  }
  function switchUrl(url, host) {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Open an HTTP or HTTPS page first.');
    target.hostname = hostname(host);
    return target.href;
  }
  function discover(value, host) {
    const config = settings(value);
    host = hostname(host);
    if (!config.autoDiscover || config.groups.some(group => group.domains.some(domain => domain.hostname === host))) return config;
    // Group only observed hosts; never invent destinations or overwrite an edited mapping.
    const match = host.match(/^(.+?)-(qa-uatx|stagingx?|qax?|uatx?|pre-?prod(?:uction)?x?|prod(?:uction)?x?)(-designer)?\.unqork\.io$/);
    if (!match) return config;
    const surface = match[3] ? 'designer' : match[2].endsWith('x') ? 'express' : 'standard';
    const autoKey = match[1] + ':' + surface;
    let group = config.groups.find(group => group.autoKey === autoKey);
    if (!group) {
      group = { id:'auto:' + autoKey, autoKey, name:match[1] + (surface === 'standard' ? '' : ' · ' + surface), domains:[] };
      config.groups.push(group);
    }
    group.domains.push({ hostname:host, environment:detect('https://' + host).kind });
    return settings(config);
  }
  function customOrigins(value) {
    return settings(value).groups.flatMap(group => group.domains).filter(domain => !domain.hostname.endsWith('.unqork.io')).map(domain => '*://' + domain.hostname + '/*');
  }
  function floatingSettings(value) {
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    return { enabled:value?.enabled !== false, position:positions.includes(value?.position) ? value.position : 'bottom-left' };
  }
  return { labels, hostname, settings, detect, switchUrl, discover, customOrigins, floatingSettings };
})();
