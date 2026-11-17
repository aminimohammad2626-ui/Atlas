/* ===== Patch Center ===== */
const PatchCenter = {
  TRUSTED_PUBLISHERS: ['atlas-official'],

  validate(pkg) {
    if (!pkg || typeof pkg !== 'object') return { ok: false, msg: t('patchBadFormat') };
    if (pkg.format !== 'atlas-patch') return { ok: false, msg: t('patchBadFormat') };
    const req = ['id', 'name', 'version', 'minAppVersion', 'payload'];
    for (const k of req) if (pkg[k] === undefined) return { ok: false, msg: t('patchBadFormat') + ' (' + k + ')' };
    if (!pkg.payload || (typeof pkg.payload.js !== 'string' && typeof pkg.payload.css !== 'string')) {
      return { ok: false, msg: t('patchBadFormat') + ' (payload)' };
    }
    if (pkg.integrity && pkg.integrity.payloadHash) {
      const actual = SHA256(JSON.stringify(pkg.payload));
      if (actual !== pkg.integrity.payloadHash) return { ok: false, msg: t('patchBadIntegrity') };
    }
    return { ok: true };
  },

  compat(pkg) {
    const cmpVer = (a, b) => {
      const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
      }
      return 0;
    };
    if (pkg.minAppVersion && cmpVer(APP_VERSION, pkg.minAppVersion) < 0) return { ok: false, msg: t('patchIncompatible', { app: APP_VERSION, min: pkg.minAppVersion, max: pkg.maxAppVersion || '?' }) };
    if (pkg.maxAppVersion && cmpVer(APP_VERSION, pkg.maxAppVersion) > 0) return { ok: false, msg: t('patchIncompatible', { app: APP_VERSION, min: pkg.minAppVersion, max: pkg.maxAppVersion }) };
    return { ok: true };
  },

  conflicts(pkg) {
    const installed = Store.state.meta.installedPatches || [];
    if ((pkg.conflicts || []).some(c => installed.some(p => p.id === c))) return { ok: false, msg: t('patchConflicts') };
    return { ok: true };
  },

  /* staged install: snapshot -> apply -> health check -> commit | auto-rollback */
  install(pkg) {
    Perms.assert('patch', 'install');
    let check = this.validate(pkg);
    if (!check.ok) throw new Error(check.msg);
    check = this.compat(pkg);
    if (!check.ok) throw new Error(check.msg);
    check = this.conflicts(pkg);
    if (!check.ok) throw new Error(check.msg);

    const snapshot = U.clone(Store.state);
    const snapshotActive = U.clone(Store.state.activePatchPayloads);
    try {
      /* migration */
      if (pkg.payload.migration && typeof pkg.payload.migration === 'object') {
        const m = pkg.payload.migration;
        if (m.toSchema > Store.state.meta.schemaVersion) {
          Migrations.apply(Store.state, m.toSchema);
        }
      }
      /* data operations */
      if (pkg.payload.dataOps) this.runDataOps(pkg.payload.dataOps);
      /* register payload for persistence + boot-time activation */
      Store.state.activePatchPayloads[pkg.id] = { js: pkg.payload.js || '', css: pkg.payload.css || '', version: pkg.version };
      /* activation + health check */
      this.activate(pkg.id, pkg.payload);
      const record = {
        id: pkg.id, name: pkg.name, nameFa: pkg.nameFa || pkg.name, version: pkg.version,
        publisher: pkg.publisher || 'unknown',
        installedAt: U.nowISO(), installedBy: Auth.currentUserId(),
        result: 'installed',
        schemaAfter: Store.state.meta.schemaVersion,
        rollbackAvailable: true
      };
      Store.state.meta.installedPatches = (Store.state.meta.installedPatches || []).filter(p => p.id !== pkg.id);
      Store.state.meta.installedPatches.push({ id: pkg.id, version: pkg.version, installedAt: record.installedAt, active: true });
      Store.state.patchHistory.push(record);
      Store.audit('installPatch', 'patch:' + pkg.id, null, pkg.version);
      Store.persist();
      return { ok: true, record };
    } catch (e) {
      Store.state = snapshot;
      Store.state.activePatchPayloads = snapshotActive;
      Store.persist();
      throw new Error(t('patchAutoRollback') + ' — ' + (e.message || e));
    }
  },

  runDataOps(ops) {
    (ops || []).forEach(op => {
      if (op.type === 'ensureCollection') {
        if (!Array.isArray(Store.state[op.collection])) Store.state[op.collection] = [];
      } else if (op.type === 'setting') {
        Store.state.settings[op.key] = op.value;
      }
    });
  },

  activate(patchId, payload) {
    try {
      if (payload.css) {
        let el = document.getElementById('patch-css-' + patchId);
        if (!el) {
          el = document.createElement('style');
          el.id = 'patch-css-' + patchId;
          document.head.appendChild(el);
        }
        el.textContent = payload.css;
      }
      if (payload.js) {
        const fn = new Function('Atlas', '"use strict";\n' + payload.js);
        fn(window.Atlas);
      }
      return { ok: true };
    } catch (e) {
      throw new Error('activation failed: ' + (e.message || e));
    }
  },

  deactivate(patchId) {
    Perms.assert('patch', 'install');
    const rec = (Store.state.meta.installedPatches || []).find(p => p.id === patchId);
    if (rec) rec.active = false;
    if (Store.state.activePatchPayloads[patchId]) Store.state.activePatchPayloads[patchId].active = false;
    const el = document.getElementById('patch-css-' + patchId);
    if (el) el.remove();
    Store.audit('deactivatePatch', 'patch:' + patchId);
    Store.persist();
    UI.toast(t('savedOk'), 'success');
    UI.render();
  },

  reactivate(patchId) {
    Perms.assert('patch', 'install');
    const stored = Store.state.activePatchPayloads[patchId];
    const rec = (Store.state.meta.installedPatches || []).find(p => p.id === patchId);
    if (rec) rec.active = true;
    if (stored) { stored.active = true; this.activate(patchId, stored); }
    Store.persist();
    UI.toast(t('savedOk'), 'success');
    UI.render();
  },

  rollback(patchId) {
    Perms.assert('patch', 'install');
    const rec = Store.state.patchHistory.filter(p => p.id === patchId).pop();
    if (!rec || !rec.rollbackAvailable) throw new Error(t('patchNoRollback'));
    const el = document.getElementById('patch-css-' + patchId);
    if (el) el.remove();
    Store.state.meta.installedPatches = (Store.state.meta.installedPatches || []).filter(p => p.id !== patchId);
    delete Store.state.activePatchPayloads[patchId];
    rec.result = 'rolledBack';
    rec.rolledBackAt = U.nowISO();
    rec.rollbackAvailable = false;
    Store.audit('rollbackPatch', 'patch:' + patchId, null, null);
    Store.persist();
    UI.render();
  }
};
