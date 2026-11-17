/* ===== Permissions engine ===== */
const Perms = {
  MODULES: [
    { id: 'dashboard', ops: ['view'] },
    { id: 'projects', ops: ['view', 'create', 'edit', 'delete', 'assign', 'archive', 'restore', 'export'] },
    { id: 'tasks', ops: ['view', 'create', 'edit', 'delete', 'assign', 'approve', 'export'] },
    { id: 'calendar', ops: ['view'] },
    { id: 'employees', ops: ['view', 'create', 'edit', 'delete', 'archive', 'restore', 'export'] },
    { id: 'org', ops: ['view', 'create', 'edit', 'delete', 'configure'] },
    { id: 'reports', ops: ['view', 'export'] },
    { id: 'notifications', ops: ['view'] },
    { id: 'users', ops: ['view', 'create', 'edit', 'delete'] },
    { id: 'roles', ops: ['view', 'create', 'edit', 'delete'] },
    { id: 'workflow', ops: ['view', 'edit', 'configure'] },
    { id: 'settings', ops: ['view', 'edit', 'configure'] },
    { id: 'backup', ops: ['view', 'create', 'restore'] },
    { id: 'patch', ops: ['view', 'install'] },
    { id: 'audit', ops: ['view'] },
    { id: 'customfields', ops: ['view', 'create', 'edit', 'delete'] }
  ],
  SCOPES: ['all', 'department', 'team', 'assigned', 'own'],

  isAdmin(user) {
    if (!user) return false;
    return (user.roles || []).some(rid => rid === 'role-admin');
  },
  isOrgAdmin(user) {
    if (!user) return false;
    return (user.roles || []).some(rid => rid === 'role-admin' || rid === 'role-orgadmin');
  },

  /* effective permission map: role perms merged, then overrides (deny wins) */
  effective(user) {
    if (!user) return {};
    const eff = {};
    (user.roles || []).forEach(rid => {
      const role = U.byId(Store.state.roles, rid);
      if (!role) return;
      for (const m in role.perms || {}) {
        eff[m] = eff[m] || {};
        for (const op in role.perms[m]) {
          const scope = role.perms[m][op];
          if (!eff[m][op] || this.scopeRank(scope) > this.scopeRank(eff[m][op])) eff[m][op] = scope;
        }
      }
    });
    const ov = user.overrides || {};
    (ov.grants || []).forEach(g => {
      eff[g.module] = eff[g.module] || {};
      if (!eff[g.module][g.op] || this.scopeRank(g.scope) > this.scopeRank(eff[g.module][g.op])) eff[g.module][g.op] = g.scope;
    });
    (ov.denies || []).forEach(d => {
      eff[d.module] = eff[d.module] || {};
      eff[d.module][d.op] = 'none';
    });
    return eff;
  },

  scopeRank(s) {
    return { none: -1, own: 1, assigned: 2, team: 3, department: 4, all: 5 }[s] || 0;
  },

  /* user's organizational context for scope evaluation */
  userContext(user) {
    const emp = user && user.employeeId ? U.byId(Store.state.employees, user.employeeId) : null;
    return {
      userId: user ? user.id : null,
      employeeId: emp ? emp.id : null,
      departmentId: emp ? emp.departmentId : null,
      teamId: emp ? emp.teamId : null
    };
  },

  recordContext(module, record) {
    if (!record) return {};
    const ctx = {
      creatorId: record.creatorId || record.createdBy || null,
      assigneeIds: record.assigneeIds || (record.assigneeId ? [record.assigneeId] : []),
      employeeId: record.employeeId || record.id || null,
      departmentId: record.departmentId || null,
      teamId: record.teamId || null
    };
    if (module === 'projects' && record.memberIds) ctx.assigneeIds = record.memberIds;
    return ctx;
  },

  scopeAllows(scope, uctx, rctx) {
    if (scope === 'all') return true;
    if (scope === 'none') return false;
    if (scope === 'own') return rctx.creatorId === uctx.userId || rctx.employeeId === uctx.employeeId;
    if (scope === 'assigned') return uctx.employeeId && (rctx.assigneeIds || []).includes(uctx.employeeId);
    if (scope === 'team') return uctx.teamId && rctx.teamId === uctx.teamId;
    if (scope === 'department') return uctx.departmentId && rctx.departmentId === uctx.departmentId;
    return false;
  },

  /* tasks inherit project department when unset */
  enrichRecord(module, record) {
    const r = this.recordContext(module, record);
    if (module === 'tasks' && !r.departmentId && record.projectId) {
      const p = U.byId(Store.state.projects, record.projectId);
      if (p) { r.departmentId = p.departmentId; r.teamId = r.teamId || p.teamId; }
    }
    return r;
  },

  /* main check: can current user perform op on module (optionally on a record) */
  can(module, op, record) {
    const user = Auth.currentUser();
    return this.canUser(user, module, op, record);
  },

  canUser(user, module, op, record) {
    if (this.systemMode) return true;
    if (!user || user.status !== 'active') return false;
    const eff = this.effective(user);
    const scope = eff[module] && eff[module][op];
    if (!scope || scope === 'none') return false;
    if (!record) return true;
    const uctx = this.userContext(user);
    const rctx = this.enrichRecord(module, record);
    return this.scopeAllows(scope, uctx, rctx);
  },

  /* filter a record list by view permission */
  visible(module, records) {
    if (this.systemMode) return records;
    const user = Auth.currentUser();
    if (!user) return [];
    const eff = this.effective(user);
    const scope = eff[module] && eff[module].view;
    if (!scope || scope === 'none') return [];
    if (scope === 'all') return records;
    const uctx = this.userContext(user);
    return records.filter(r => this.scopeAllows(scope, uctx, this.enrichRecord(module, r)));
  },

  assert(module, op, record) {
    if (!this.can(module, op, record)) {
      const err = new Error('permDenied');
      err.code = 'permDenied';
      throw err;
    }
  },

  /* simulate effective permissions for the simulator UI */
  simulateUser(userId) {
    const user = U.byId(Store.state.users, userId);
    return user ? this.effective(user) : {};
  }
};
