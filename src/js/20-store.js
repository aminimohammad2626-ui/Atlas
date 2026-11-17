/* ===== Store: state, schema, persistence, audit ===== */
const APP_VERSION = window.ATLAS_META.appVersion;
const SCHEMA_VERSION = window.ATLAS_META.schemaVersion;
const LS_KEY = 'atlas-state';
const LS_SESSION = 'atlas-session';

const Store = {
  state: null,
  dirty: false,
  lastSavedAt: null,
  listeners: [],

  defaultState() {
    return {
      meta: {
        schemaVersion: SCHEMA_VERSION,
        appVersionAtCreation: APP_VERSION,
        createdAt: U.nowISO(),
        installedPatches: [],
        migrationHistory: []
      },
      settings: {
        language: 'fa',
        theme: 'simple',
        mode: 'simple',
        autosave: true,
        autosaveInterval: 60,
        weekStart: 6,
        defaultTaskStatus: 'todo',
        defaultProjectStatus: 'active',
        dashboardWidgets: { stats: true, charts: true, deadlines: true, activity: true, milestones: true, workload: true },
        notifPrefs: {}
      },
      counters: { project: 0, task: 0, employee: 0, dept: 0, team: 0, user: 0, role: 0 },
      departments: [],
      teams: [],
      employees: [],
      users: [],
      roles: [],
      projects: [],
      tasks: [],
      milestones: [],
      notifications: [],
      auditLog: [],
      customFields: [],
      announcements: [],
      patchHistory: [],
      activePatchPayloads: {}
    };
  },

  defaultRoles() {
    const P = (m, ops) => {
      const o = {};
      const A = ops || ['view', 'create', 'edit', 'delete', 'assign', 'approve', 'export', 'archive', 'restore', 'configure', 'install'];
      m.forEach(x => { o[x] = {}; A.forEach(op => o[x][op] = 'all'); });
      return o;
    };
    const all = ['dashboard', 'projects', 'tasks', 'calendar', 'employees', 'org', 'reports', 'notifications', 'users', 'roles', 'workflow', 'settings', 'backup', 'patch', 'audit', 'customfields'];
    const view = ['dashboard', 'projects', 'tasks', 'calendar', 'employees', 'org', 'reports', 'notifications'];
    const emp = { dashboard: { view: 'all' }, tasks: { view: 'all', create: 'all', edit: 'assigned', delete: 'own' }, calendar: { view: 'all' }, projects: { view: 'all' }, employees: { view: 'department' }, org: { view: 'all' }, reports: { view: 'department' }, notifications: { view: 'all' } };
    const pm = {
      dashboard: { view: 'all' },
      projects: { view: 'all', create: 'all', edit: 'all', delete: 'all', assign: 'all', archive: 'all', restore: 'all', export: 'all' },
      tasks: { view: 'all', create: 'all', edit: 'all', delete: 'all', assign: 'all', approve: 'all', export: 'all' },
      calendar: { view: 'all' }, employees: { view: 'all' }, org: { view: 'all' },
      reports: { view: 'all', export: 'all' }, notifications: { view: 'all' }
    };
    const orgAdmin = JSON.parse(JSON.stringify(pm));
    orgAdmin.employees = { view: 'all', create: 'all', edit: 'all', delete: 'all', archive: 'all', restore: 'all', export: 'all' };
    orgAdmin.org = { view: 'all', create: 'all', edit: 'all', delete: 'all', configure: 'all' };
    orgAdmin.users = { view: 'all', create: 'all', edit: 'all', delete: 'all' };
    orgAdmin.settings = { view: 'all', edit: 'all', configure: 'all' };
    orgAdmin.customfields = { view: 'all', create: 'all', edit: 'all', delete: 'all' };
    orgAdmin.workflow = { view: 'all', edit: 'all', configure: 'all' };
    orgAdmin.audit = { view: 'all' };
    const admin = P(all);
    const deptMgr = JSON.parse(JSON.stringify(emp));
    deptMgr.projects = { view: 'department', create: 'department', edit: 'department', delete: 'department', assign: 'department', export: 'department' };
    deptMgr.tasks = { view: 'department', create: 'department', edit: 'department', delete: 'department', assign: 'department', approve: 'department', export: 'department' };
    deptMgr.employees = { view: 'department', edit: 'department' };
    deptMgr.org = { view: 'all' };
    deptMgr.reports = { view: 'department', export: 'department' };
    const lead = JSON.parse(JSON.stringify(emp));
    lead.tasks = { view: 'team', create: 'team', edit: 'team', delete: 'team', assign: 'team', export: 'team' };
    lead.projects = { view: 'team', create: 'team', edit: 'team' };
    lead.reports = { view: 'team', export: 'team' };
    const viewer = {};
    view.forEach(m => viewer[m] = { view: 'all' });
    return [
      { id: 'role-admin', key: 'role_admin', system: true, perms: admin, descriptionKey: 'role_admin_d' },
      { id: 'role-orgadmin', key: 'role_orgAdmin', system: true, perms: orgAdmin, descriptionKey: 'role_orgAdmin_d' },
      { id: 'role-pm', key: 'role_pm', system: true, perms: pm, descriptionKey: 'role_pm_d' },
      { id: 'role-deptmgr', key: 'role_deptMgr', system: true, perms: deptMgr, descriptionKey: 'role_deptMgr_d' },
      { id: 'role-lead', key: 'role_lead', system: true, perms: lead, descriptionKey: 'role_lead_d' },
      { id: 'role-emp', key: 'role_emp', system: true, perms: emp, descriptionKey: 'role_emp_d' },
      { id: 'role-viewer', key: 'role_viewer', system: true, perms: viewer, descriptionKey: 'role_viewer_d' }
    ];
  },

  defaultStatuses() {
    return {
      task: [
        { id: 'todo', fa: 'شروع‌نشده', en: 'Not Started', kind: 'open', color: '#94a3b8' },
        { id: 'inprogress', fa: 'در حال انجام', en: 'In Progress', kind: 'active', color: '#2563eb' },
        { id: 'pending', fa: 'در انتظار', en: 'Pending', kind: 'active', color: '#d97706' },
        { id: 'blocked', fa: 'متوقف', en: 'Blocked', kind: 'active', color: '#dc2626' },
        { id: 'review', fa: 'در حال بررسی', en: 'Under Review', kind: 'active', color: '#7c3aed' },
        { id: 'done', fa: 'تکمیل‌شده', en: 'Completed', kind: 'done', color: '#16a34a' },
        { id: 'cancelled', fa: 'لغوشده', en: 'Cancelled', kind: 'cancelled', color: '#6b7280' }
      ],
      project: [
        { id: 'planning', fa: 'برنامه‌ریزی', en: 'Planning', kind: 'open', color: '#94a3b8' },
        { id: 'active', fa: 'فعال', en: 'Active', kind: 'active', color: '#2563eb' },
        { id: 'onhold', fa: 'معلق', en: 'On Hold', kind: 'active', color: '#d97706' },
        { id: 'completed', fa: 'تکمیل‌شده', en: 'Completed', kind: 'done', color: '#16a34a' },
        { id: 'cancelled', fa: 'لغوشده', en: 'Cancelled', kind: 'cancelled', color: '#6b7280' }
      ]
    };
  },

  defaultWorkflow() {
    return {
      task: {
        transitions: {
          todo: ['inprogress', 'pending', 'cancelled'],
          inprogress: ['pending', 'blocked', 'review', 'done', 'cancelled'],
          pending: ['inprogress', 'blocked', 'cancelled'],
          blocked: ['inprogress', 'pending', 'cancelled'],
          review: ['inprogress', 'done', 'cancelled'],
          done: ['inprogress'],
          cancelled: ['todo']
        },
        requireResultOnDone: true,
        stages: ['برنامه‌ریزی', 'اجرا', 'بازبینی', 'تحویل']
      },
      project: {
        transitions: {
          planning: ['active', 'cancelled'],
          active: ['onhold', 'completed', 'cancelled'],
          onhold: ['active', 'cancelled'],
          completed: ['active'],
          cancelled: ['planning']
        },
        requireResultOnDone: false,
        stages: []
      }
    };
  },

  defaultPriorities() {
    return [
      { id: 'critical', fa: 'فوری', en: 'Critical', level: 4 },
      { id: 'high', fa: 'بالا', en: 'High', level: 3 },
      { id: 'medium', fa: 'متوسط', en: 'Medium', level: 2 },
      { id: 'low', fa: 'پایین', en: 'Low', level: 1 }
    ];
  },

  fresh() {
    const s = this.defaultState();
    s.roles = this.defaultRoles();
    s.statuses = this.defaultStatuses();
    s.workflow = this.defaultWorkflow();
    s.priorities = this.defaultPriorities();
    return s;
  },

  init() {
    let raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* storage unavailable */ }
    const embedded = this.readEmbedded();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.meta) {
          this.state = parsed;
          this.migrate();
          return { source: 'localStorage' };
        }
      } catch (e) { console.error('corrupt localStorage state', e); }
    }
    if (embedded) {
      this.state = embedded;
      this.migrate();
      this.persist(false);
      return { source: 'embedded' };
    }
    this.state = this.fresh();
    return { source: 'new' };
  },

  readEmbedded() {
    const el = document.getElementById('atlas-embedded-data');
    if (!el) return null;
    try {
      const data = JSON.parse(el.textContent);
      return (data && data.meta) ? data : null;
    } catch (e) { return null; }
  },

  migrate() {
    const s = this.state;
    if (!s.meta.schemaVersion) s.meta.schemaVersion = 1;
    if (s.meta.schemaVersion < SCHEMA_VERSION) {
      Migrations.apply(s, SCHEMA_VERSION);
    }
    const def = this.fresh();
    for (const k in def) if (s[k] === undefined) s[k] = def[k];
    for (const k in def.settings) if (s.settings[k] === undefined) s.settings[k] = def.settings[k];
    if (!s.priorities) s.priorities = this.defaultPriorities();
  },

  persist(markSaved) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.state));
      if (markSaved !== false) {
        this.dirty = false;
        this.lastSavedAt = U.nowISO();
      }
      try { localStorage.setItem('atlas-lastsave', this.lastSavedAt || ''); } catch (e) {}
      return true;
    } catch (e) {
      console.error('persist failed', e);
      UI.toast(t('saveFailed', { msg: e.message || 'storage' }), 'error');
      return false;
    }
  },

  markDirty() {
    this.dirty = true;
    if (this.settingsAutosaveEnabled()) SaveSys.scheduleAutosave();
    UI.updateSaveIndicator();
  },

  settingsAutosaveEnabled() {
    return this.state && this.state.settings && this.state.settings.autosave;
  },

  audit(action, target, prev, next) {
    const entry = {
      id: U.uid('aud'),
      at: U.nowISO(),
      actorId: Auth.currentUserId(),
      action, target,
      prev: prev === undefined ? null : prev,
      next: next === undefined ? null : next,
      result: 'ok'
    };
    this.state.auditLog.push(entry);
    if (this.state.auditLog.length > 5000) this.state.auditLog.splice(0, this.state.auditLog.length - 5000);
    this.markDirty();
    return entry;
  },

  /* transaction: apply changes atomically; rollback on exception */
  transaction(fn) {
    const snapshot = U.clone({ data: this.state });
    try {
      const result = fn();
      this.markDirty();
      return { ok: true, result };
    } catch (e) {
      this.state = snapshot.data;
      return { ok: false, error: e };
    }
  },

  nextSeq(kind) {
    this.state.counters[kind] = (this.state.counters[kind] || 0) + 1;
    return this.state.counters[kind];
  }
};
