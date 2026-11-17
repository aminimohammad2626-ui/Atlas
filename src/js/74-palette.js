/* ===== Command palette (Ctrl+K) ===== */
UI.palette = {
  el: null,
  input: null,
  listEl: null,
  results: [],
  sel: 0,

  sources() {
    const navIds = ['dashboard', 'myTasks', 'projects', 'tasks', 'calendar', 'reports',
      'employees', 'org', 'users', 'roles', 'workflow', 'backup', 'patchCenter', 'settings', 'auditLog'];
    const out = [];
    navIds.forEach(id => {
      const v = UI.views[id];
      if (!v) return;
      if (v.module && !Perms.can(v.module, 'view')) return;
      out.push({ group: 'nav', icon: UI.iconFor(id), label: v.title(), run: () => UI.nav(id) });
    });
    const acts = [];
    if (Perms.can('tasks', 'create')) acts.push({ icon: '✅', label: t('newTask'), run: () => { UI.nav('tasks'); TaskViews.openForm(null); } });
    if (Perms.can('projects', 'create')) acts.push({ icon: '📁', label: t('newProject'), run: () => { UI.nav('projects'); ProjectViews.openForm(null); } });
    if (Perms.can('employees', 'create')) acts.push({ icon: '👤', label: t('newEmployee'), run: () => { UI.nav('employees'); EmployeeViews.openForm(null); } });
    if (Perms.can('users', 'create')) acts.push({ icon: '🔑', label: t('newUser'), run: () => { UI.nav('users'); AdminViews.userForm(null); } });
    acts.push({ icon: '💾', label: t('save'), run: () => SaveSys.save() });
    acts.push({ icon: '🌐', label: t('language') + ' (' + (I18N.getLang() === 'fa' ? 'English' : 'فارسی') + ')', run: () => {
      Store.state.settings.language = I18N.getLang() === 'fa' ? 'en' : 'fa';
      Store.persist(); UI.render();
    } });
    acts.forEach(a => out.push(Object.assign({ group: 'actions' }, a)));
    const q = (this.input ? this.input.value : '').trim().toLowerCase();
    if (q) {
      Tasks.visible().filter(x => x.title.toLowerCase().includes(q)).slice(0, 5).forEach(x => {
        out.push({ group: 'records', icon: '✅', label: x.title, hint: t('task'), run: () => { UI.nav('tasks'); TaskViews.openDetails(x.id); } });
      });
      Perms.visible('projects', Store.state.projects.filter(x => x.title.toLowerCase().includes(q))).slice(0, 5).forEach(x => {
        out.push({ group: 'records', icon: '📁', label: x.title, hint: t('project'), run: () => UI.nav('projectDetail', { id: x.id }) });
      });
      Perms.visible('employees', Store.state.employees.filter(x => (x.fullName || '').toLowerCase().includes(q))).slice(0, 5).forEach(x => {
        out.push({ group: 'records', icon: '👤', label: x.fullName, hint: t('employee'), run: () => UI.nav('employees') });
      });
    }
    return out;
  },

  query() {
    const q = (this.input.value || '').trim().toLowerCase();
    const all = this.sources();
    this.results = q ? all.filter(s => s.label.toLowerCase().includes(q)) : all.filter(s => s.group !== 'records');
    this.sel = 0;
    this.renderList();
  },

  renderList() {
    const groups = { nav: t('paletteNav'), actions: t('paletteActions'), records: t('paletteRecords') };
    let html = '', lastGroup = null;
    this.results.forEach((s, i) => {
      if (s.group !== lastGroup) {
        html += '<div class="palette-group">' + U.esc(groups[s.group] || s.group) + '</div>';
        lastGroup = s.group;
      }
      html += '<div class="palette-item' + (i === this.sel ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span class="palette-icon">' + (s.icon || '•') + '</span><span class="palette-label">' + U.esc(s.label) + '</span>' +
        (s.hint ? '<span class="palette-hint">' + U.esc(s.hint) + '</span>' : '') + '</div>';
    });
    this.listEl.innerHTML = html || '<div class="palette-empty">' + U.esc(t('paletteEmpty')) + '</div>';
    this.listEl.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('click', () => this.choose(+item.dataset.idx));
      item.addEventListener('mousemove', () => {
        if (this.sel !== +item.dataset.idx) { this.sel = +item.dataset.idx; this.renderList(); }
      });
    });
    const act = this.listEl.querySelector('.palette-item.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  },

  open() {
    if (this.el) return;
    if (!Auth.currentUser()) return;
    const ov = document.createElement('div');
    ov.className = 'palette-overlay';
    ov.innerHTML = '<div class="palette-box" role="dialog" aria-label="' + U.esc(t('paletteTitle')) + '">' +
      '<input type="text" class="palette-input" placeholder="' + U.esc(t('palettePlaceholder')) + '">' +
      '<div class="palette-list"></div>' +
      '<div class="palette-foot"><span>Ctrl+K</span><span>' + U.esc(t('paletteHint')) + '</span></div></div>';
    document.body.appendChild(ov);
    this.el = ov;
    this.input = ov.querySelector('.palette-input');
    this.listEl = ov.querySelector('.palette-list');
    ov.addEventListener('mousedown', e => { if (e.target === ov) this.close(); });
    this.input.addEventListener('input', () => this.query());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.choose(this.sel); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.query();
    this.input.focus();
  },

  close() {
    if (this.el) { this.el.remove(); this.el = null; this.input = null; this.listEl = null; this.results = []; }
  },

  move(d) {
    if (!this.results.length) return;
    this.sel = (this.sel + d + this.results.length) % this.results.length;
    this.renderList();
  },

  choose(i) {
    const s = this.results[i];
    if (!s) return;
    this.close();
    try { s.run(); } catch (e) { UI.toast(e.message, 'error'); }
  }
};
