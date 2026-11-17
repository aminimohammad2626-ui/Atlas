/* ===== window.Atlas extension API + boot sequence ===== */
window.Atlas = {
  version: APP_VERSION,
  schemaVersion: SCHEMA_VERSION,
  /* shared module access for patches */
  Store, UI, I18N, U, Cal, Widgets, Charts,
  Auth, Perms, Org, Employees, Users, Roles,
  Workflow, Priorities, Notifications,
  Projects, Tasks, Search, Reports,
  Migrations, Backup, PatchCenter, SaveSys,
  TaskViews, ProjectViews, EmployeeViews, AdminViews,
  t: (k, p) => t(k, p),
  sha256: s => SHA256(s),

  registerModule(mod) {
    if (!mod || !mod.id) throw new Error('registerModule: id required');
    if (!Perms.MODULES.some(m => m.id === mod.id)) {
      Perms.MODULES.push({ id: mod.id, ops: mod.ops || ['view'] });
      Store.state.roles.forEach(role => {
        if (role.id === 'role-admin' || role.id === 'role-orgadmin') {
          role.perms[mod.id] = role.perms[mod.id] || {};
          (mod.ops || ['view']).forEach(op => { role.perms[mod.id][op] = 'all'; });
        }
      });
      Store.markDirty();
    }
    return { ok: true, id: mod.id };
  },

  registerView(view) {
    if (!view || !view.id || typeof view.render !== 'function') throw new Error('registerView: invalid view');
    UI.registerView(view);
    if (view.icon) UI.iconMap[view.id] = view.icon;
    UI.render();
    return { ok: true, id: view.id };
  },

  registerReport(def) {
    if (!def || !def.id || typeof def.run !== 'function') throw new Error('registerReport: invalid report');
    Reports._extra = Reports._extra || [];
    Reports._extra = Reports._extra.filter(r => r.id !== def.id);
    Reports._extra.push(def);
    return { ok: true, id: def.id };
  },

  registerStatus(kind, status) {
    const list = Store.state.statuses[kind];
    if (!Array.isArray(list)) throw new Error('registerStatus: kind ' + kind);
    if (!list.some(s => s.id === status.id)) list.push(status);
    Store.markDirty();
    return { ok: true };
  }
};

/* make report definitions extensible without touching base logic */
(function () {
  const baseDefs = Reports.definitions.bind(Reports);
  Reports.definitions = function () {
    return baseDefs().concat((this._extra || []).map(d => ({ id: d.id, key: d.key || d.id })));
  };
  const baseRun = Reports.run.bind(Reports);
  Reports.run = function (id, filters) {
    const extra = (this._extra || []).find(r => r.id === id);
    if (extra) return extra.run(filters || {});
    return baseRun(id, filters);
  };
})();

/* icon map is extensible for patch-registered views */
UI.iconMap = {};
UI.iconFor = (function (orig) {
  return function (id) { return this.iconMap[id] || orig(id); };
})(UI.iconFor.bind(UI));

(function boot() {
  /* 1. capture the pristine template BEFORE any DOM mutation so saves embed clean app code */
  SaveSys.captureTemplate();

  /* 2. load state: localStorage first, then embedded data, then fresh */
  Store.init();

  /* 3. locale + theme */
  I18N.setLang(Store.state.settings.language);
  document.documentElement.dataset.theme = Store.state.settings.theme || 'simple';

  /* 4. session restore */
  Auth.restoreSession();

  /* 5. reactivate installed patch payloads (from state; embedded patch script is only a transport) */
  const payloads = Store.state.activePatchPayloads || {};
  Object.keys(payloads).forEach(pid => {
    if (payloads[pid].active === false) return;
    try {
      PatchCenter.activate(pid, { js: payloads[pid].js, css: payloads[pid].css });
    } catch (e) {
      console.error('patch activation failed at boot:', pid, e);
      const rec = (Store.state.meta.installedPatches || []).find(p => p.id === pid);
      if (rec) rec.active = false;
      delete Store.state.activePatchPayloads[pid];
      Store.state.patchHistory.push({
        id: pid, name: pid, version: (payloads[pid] && payloads[pid].version) || '?',
        publisher: '—', installedAt: U.nowISO(), installedBy: null,
        result: 'bootFailed', schemaAfter: Store.state.meta.schemaVersion, rollbackAvailable: false
      });
      Store.persist();
    }
  });

  /* 6. hash routing */
  function applyHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    const [viewId, q] = h.split('?');
    if (UI.views[viewId]) {
      const params = {};
      if (q) new URLSearchParams(q).forEach((v, k) => { params[k] = v; });
      UI.route = { view: viewId, params };
    }
  }
  window.addEventListener('hashchange', () => {
    applyHash();
    UI.render();
  });
  applyHash();

  /* 7. first paint */
  UI.render();

  /* 8. autosave */
  SaveSys.scheduleAutosave();

  /* 9. recovery prompt: localStorage state newer than portable save */
  const lastPortable = Store.state.meta.lastPortableSave;
  if (lastPortable && Store.lastSavedAt && Store.lastSavedAt > lastPortable && Auth.currentUser()) {
    UI.modal({
      title: t('recoverPrompt'),
      body: '<p>' + U.esc(t('dirtyWarning')) + '</p><p class="muted small">' + U.esc(t('lastSaved') + ': ' + Cal.formatTimestamp(Store.lastSavedAt, I18N.getLang())) + '</p>',
      foot: '<button class="btn" data-close>' + t('recoverNo') + '</button>' +
        '<button class="btn btn-primary" id="rc-yes">' + t('recoverYes') + '</button>',
      onMount(el, close) {
        el.querySelector('#rc-yes').addEventListener('click', () => {
          close();
          SaveSys.save();
        });
      }
    });
  }
})();
