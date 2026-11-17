/* ===== UI core: router, layout, components ===== */
const UI = {
  route: { view: 'dashboard', params: {} },
  views: {},
  navItems: [],

  registerView(view) {
    this.views[view.id] = view;
  },

  nav(viewId, params) {
    this.route = { view: viewId, params: params || {} };
    this.render();
    window.scrollTo(0, 0);
  },

  fmtDate(iso, opts) { return Cal.formatISO(iso, I18N.getLang(), opts); },
  fmtTS(ts, withTime) { return Cal.formatTimestamp(ts, I18N.getLang(), withTime); },

  toast(msg, kind) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 350); }, 3800);
  },

  modal(opts) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal ' + (opts.large ? 'modal-lg' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + U.esc(opts.title) + '</h3>' +
      '<button class="btn btn-ghost btn-icon" data-close aria-label="' + t('close') + '">✕</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.foot !== null ? '<div class="modal-foot">' + (opts.foot || '') + '</div>' : '') + '</div>';
    root.appendChild(overlay);
    const close = () => { overlay.remove(); if (opts.onClose) opts.onClose(); };
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    if (opts.onMount) opts.onMount(overlay, close);
    const firstInput = overlay.querySelector('input,select,textarea,button.btn-primary');
    if (firstInput) firstInput.focus();
    return { el: overlay, close };
  },

  confirm(msg, onYes, danger) {
    this.modal({
      title: t('confirm'),
      body: '<p>' + U.esc(msg) + '</p>',
      foot: '<button class="btn" data-close>' + t('cancel') + '</button>' +
        '<button class="btn ' + (danger !== false ? 'btn-danger' : 'btn-primary') + '" id="cf-yes">' + t('ok') + '</button>',
      onMount(el, close) {
        el.querySelector('#cf-yes').addEventListener('click', () => { close(); onYes(); });
      }
    });
  },

  formModal(opts) {
    return this.modal({
      title: opts.title,
      body: '<form id="fm-form" novalidate>' + opts.body + '</form>',
      foot: '<button class="btn" data-close>' + t('cancel') + '</button>' +
        '<button class="btn btn-primary" id="fm-submit">' + t('save') + '</button>',
      large: opts.large,
      onMount(el, close) {
        el.querySelector('#fm-submit').addEventListener('click', () => {
          const form = el.querySelector('#fm-form');
          if (opts.onSubmit(form, close) === false) return;
        });
        const form = el.querySelector('#fm-form');
        form.addEventListener('submit', e => { e.preventDefault(); el.querySelector('#fm-submit').click(); });
        if (opts.onMount) opts.onMount(el, close);
      }
    });
  },

  fv(form, name) {
    const el = form.querySelector('[name="' + name + '"]');
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  },
  fvs(form, name) {
    return Array.from(form.querySelectorAll('[name="' + name + '"]:checked')).map(x => x.value);
  },
  fieldError(form, name, msg) {
    const el = form.querySelector('[name="' + name + '"]');
    if (!el) return;
    const field = el.closest('.field');
    if (!field) return;
    let box = field.querySelector('.field-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'field-error';
      field.appendChild(box);
    }
    box.textContent = msg;
  },

  updateSaveIndicator() {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    const cls = Store.dirty ? 'dirty' : (SaveSys.lastSavedAt || Store.state.meta.lastPortableSave ? '' : '');
    el.className = 'save-indicator ' + cls;
    const when = Store.lastSavedAt || Store.state.meta.lastPortableSave;
    const conn = SaveSys.fileHandle ? ' · ' + t('saveWithFs') : '';
    el.innerHTML = '<span class="dot"></span><span class="label">' +
      (Store.dirty ? t('dirtyWarning') : (when ? t('lastSaved') + ': ' + this.fmtTS(when) : t('neverSaved'))) + conn + '</span>';
  },

  guard(viewId, op) {
    const v = this.views[viewId];
    if (!v || v.module === null) return null;
    const mod = v.module || viewId;
    if (!Perms.can(mod, op || 'view')) {
      return '<div class="empty-state"><div class="icon">🔒</div><p>' + t('permDeniedView') + '</p></div>';
    }
    return null;
  },

  /* ---------- layout ---------- */
  render() {
    const app = document.getElementById('app');
    const user = Auth.currentUser();
    if (!user) { app.innerHTML = this.renderAuth(); this.bindAuth(); return; }
    I18N.setLang(Store.state.settings.language);
    document.documentElement.dataset.theme = Store.state.settings.theme;
    const view = this.views[this.route.view] || this.views.dashboard;
    const guardBlock = this.guard(view.id, 'view');
    const navs = this.buildNav();
    app.innerHTML =
      '<div class="layout">' +
      '<aside class="sidebar" id="sidebar">' +
      '<div class="brand"><span class="logo">A</span><span>' + U.esc(t('appName')) + '</span></div>' +
      '<nav class="nav" aria-label="main">' + navs + '</nav>' +
      '</aside>' +
      '<div class="main">' +
      '<header class="topbar">' +
      '<button class="hamburger" id="btn-menu" aria-label="menu">☰</button>' +
      '<div class="page-title">' + U.esc(view.title()) + '</div>' +
      '<form id="topbar-search" class="topbar-search hide-sm" role="search"><input type="search" id="topbar-q" placeholder="' + U.esc(t('globalSearch')) + '" aria-label="' + U.esc(t('globalSearch')) + '"></form>' +
      '<div class="save-indicator" id="save-indicator"></div>' +
      '<button class="btn btn-sm" id="btn-save-app" title="' + t('saveApp') + '">💾 <span class="hide-sm">' + t('saveApp') + '</span></button>' +
      '<button class="btn btn-ghost btn-icon" id="btn-notifications" title="' + t('notifications') + '">🔔' +
      (Notifications.unreadCount() ? '<span class="pill p-danger">' + Notifications.unreadCount() + '</span>' : '') + '</button>' +
      '<div class="user-cell"><span class="avatar">' + U.esc(this.initials(Users.displayName(user))) + '</span>' +
      '<div class="meta hide-sm"><div>' + U.esc(Users.displayName(user)) + '</div><div class="sub">' + U.esc(this.roleNames(user)) + '</div></div></div>' +
      '<button class="btn btn-ghost btn-icon" id="btn-logout" title="' + t('logout') + '">⏻</button>' +
      '</header>' +
      '<main class="content ' + (view.fluid ? 'content-fluid' : '') + '" id="content">' +
      (guardBlock || view.render(this.route.params)) +
      '</main>' +
      '</div>' +
      '</div>' +
      this.mobileTabbar();
    this.bindLayout();
    if (!guardBlock && view.bind) view.bind(this.route.params);
    this.updateSaveIndicator();
    document.getElementById('btn-save-app').addEventListener('click', () => {
      if (!SaveSys.hasFsAccess()) { SaveSys.save(); return; }
      SaveSys.ensureHandle().then(st => {
        if (st === 'ready') SaveSys.save({ preventDownload: true });
        else if (st === 'denied') SaveSys.save();
      });
    });
  },

  initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '');
  },
  roleNames(user) {
    return (user.roles || []).slice(0, 2).map(r => Roles.roleLabelById(r)).join('، ');
  },

  buildNav() {
    const items = [];
    const add = (viewId, icon, section) => {
      const v = this.views[viewId];
      if (!v) return;
      if (v.module && !Perms.can(v.module, 'view')) return;
      items.push('<a href="#' + viewId + '" data-nav="' + viewId + '" class="' + (this.route.view === viewId ? 'active' : '') + '">' +
        '<span class="nav-icon">' + icon + '</span><span>' + U.esc(v.title()) + '</span>' +
        (viewId === 'notifications' && Notifications.unreadCount() ? '<span class="badge">' + Notifications.unreadCount() + '</span>' : '') +
        '</a>');
    };
    let html = '<div class="nav-section">' + t('nav_main') + '</div>';
    const main = ['dashboard', 'myTasks', 'projects', 'tasks', 'calendar', 'reports'];
    main.forEach(id => { if (this.views[id]) add(id, this.iconFor(id), 'main'); });
    html += items.join('');
    items.length = 0;
    html += '<div class="nav-section">' + t('nav_org') + '</div>';
    ['employees', 'org', 'announcements'].forEach(id => { if (this.views[id]) add(id, this.iconFor(id), 'org'); });
    html += items.join('');
    items.length = 0;
    html += '<div class="nav-section">' + t('nav_admin') + '</div>';
    ['users', 'roles', 'workflow', 'customfields', 'auditLog'].forEach(id => { if (this.views[id]) add(id, this.iconFor(id), 'admin'); });
    html += items.join('');
    items.length = 0;
    html += '<div class="nav-section">' + t('nav_data') + '</div>';
    ['backup', 'patchCenter', 'settings'].forEach(id => { if (this.views[id]) add(id, this.iconFor(id), 'data'); });
    html += items.join('');
    return html;
  },

  iconFor(id) {
    return ({
      dashboard: '📊', myTasks: '📋', projects: '📁', tasks: '✅', calendar: '📅', reports: '📈',
      employees: '👥', org: '🏢', announcements: '📣', users: '🔑', roles: '🛡️', workflow: '🔀',
      customfields: '🧩', auditLog: '📜', backup: '💾', patchCenter: '⬆️', settings: '⚙️', notifications: '🔔'
    })[id] || '•';
  },

  mobileTabbar() {
    const ids = ['dashboard', 'tasks', 'projects', 'calendar', 'settings'];
    let html = '<nav class="mobile-tabbar">';
    ids.forEach(id => {
      const v = this.views[id];
      if (!v) return;
      if (v.module && !Perms.can(v.module, 'view')) return;
      html += '<a href="#' + id + '" data-nav="' + id + '" class="' + (this.route.view === id ? 'active' : '') + '">' +
        '<span class="nav-icon">' + this.iconFor(id) + '</span><span>' + U.esc(v.title()) + '</span></a>';
    });
    return html + '</nav>';
  },

  bindLayout() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('btn-menu');
    if (btn) btn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
    document.querySelectorAll('[data-nav]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        sidebar.classList.remove('open');
        this.nav(a.dataset.nav);
      });
    });
    document.getElementById('btn-logout').addEventListener('click', () => {
      Auth.logout();
      this.render();
    });
    const searchForm = document.getElementById('topbar-search');
    searchForm.addEventListener('submit', e => {
      e.preventDefault();
      const q = document.getElementById('topbar-q').value.trim();
      if (q) this.nav('search', { q });
    });
    document.getElementById('btn-notifications').addEventListener('click', () => {
      this.nav('notifications');
    });
  },

  /* ---------- auth screens ---------- */
  renderAuth() {
    I18N.setLang(Store.state.settings.language);
    document.documentElement.dataset.theme = Store.state.settings.theme;
    if (Store.state.users.length === 0) {
      return this.renderFirstRun();
    }
    return '<div class="login-wrap"><div class="login-box"><div class="card">' +
      '<div class="flex mb-2"><span class="logo" style="width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:grid;place-items:center;color:#fff;font-weight:700">A</span>' +
      '<div><h2 class="mb-0" style="margin:0">' + U.esc(t('appName')) + '</h2><div class="muted small">' + U.esc(t('appTitle')) + '</div></div></div>' +
      '<form id="login-form" novalidate>' +
      '<div class="field"><label for="lg-user">' + t('username') + '</label><input id="lg-user" name="username" type="text" autocomplete="username" required></div>' +
      '<div class="field"><label for="lg-pass">' + t('password') + '</label><input id="lg-pass" name="password" type="password" autocomplete="current-password" required></div>' +
      '<div class="field-error" id="lg-error"></div>' +
      '<button class="btn btn-primary" type="submit" style="width:100%">' + t('loginBtn') + '</button>' +
      '</form><p class="muted small mt-2">' + U.esc(t('loginHint')) + '</p>' +
      '<div class="flex-between"><button class="btn btn-ghost btn-sm" id="lg-lang">' + (I18N.getLang() === 'fa' ? 'English' : 'فارسی') + '</button>' +
      '<span class="muted small">v' + APP_VERSION + '</span></div>' +
      '</div></div></div>';
  },

  renderFirstRun() {
    return '<div class="login-wrap"><div class="login-box"><div class="card">' +
      '<h2>' + t('firstRunTitle') + '</h2><p class="muted">' + t('firstRunDesc') + '</p>' +
      '<form id="setup-form" novalidate>' +
      '<div class="field"><label>' + t('adminUsername') + '</label><input name="username" type="text" required pattern="[a-zA-Z0-9.]{3,32}"><div class="hint">' + t('usernameRules') + '</div></div>' +
      '<div class="field"><label>' + t('fullName') + '</label><input name="displayName" type="text" required></div>' +
      '<div class="field"><label>' + t('initialPassword') + '</label><input name="password" type="password" required minlength="6"></div>' +
      '<div class="field"><label>' + t('confirmPassword') + '</label><input name="password2" type="password" required></div>' +
      '<div class="field-error" id="su-error"></div>' +
      '<button class="btn btn-primary" type="submit" style="width:100%">' + t('setupBtn') + '</button>' +
      '</form>' +
      '<div class="mt-2 flex-between"><button class="btn btn-ghost btn-sm" id="su-lang">' + (I18N.getLang() === 'fa' ? 'English' : 'فارسی') + '</button>' +
      '<button class="btn btn-ghost btn-sm" id="su-demo">' + t('demoData') + '</button></div>' +
      '</div></div></div>';
  },

  bindAuth() {
    const langBtn = document.getElementById('lg-lang') || document.getElementById('su-lang');
    if (langBtn) langBtn.addEventListener('click', () => {
      Store.state.settings.language = I18N.getLang() === 'fa' ? 'en' : 'fa';
      Store.persist();
      this.render();
    });
    const demoBtn = document.getElementById('su-demo');
    if (demoBtn) demoBtn.addEventListener('click', () => {
      Seed.create({ withAdmin: true });
      Store.persist();
      this.toast(t('savedOk'), 'success');
      this.render();
    });
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', e => {
      e.preventDefault();
      const res = Auth.login(this.fv(loginForm, 'username'), this.fv(loginForm, 'password'));
      if (!res.ok) {
        document.getElementById('lg-error').textContent = t(res.error);
        return;
      }
      this.nav('dashboard');
    });
    const setupForm = document.getElementById('setup-form');
    if (setupForm) setupForm.addEventListener('submit', e => {
      e.preventDefault();
      const err = document.getElementById('su-error');
      const pw = this.fv(setupForm, 'password'), pw2 = this.fv(setupForm, 'password2');
      if (pw !== pw2) { err.textContent = t('passwordMismatch'); return; }
      try {
        const adminRole = Store.state.roles.find(r => r.key === 'role_admin') || Store.state.roles[0];
        Users.createFirstAdmin({ username: this.fv(setupForm, 'username'), displayName: this.fv(setupForm, 'displayName'), password: pw, roles: [adminRole.id] });
        Store.persist();
        this.toast(t('savedOk'), 'success');
        this.render();
      } catch (ex) { err.textContent = t(ex.message); }
    });
  }
};
