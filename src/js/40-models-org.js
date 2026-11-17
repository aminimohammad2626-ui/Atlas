/* ===== Models: organization, employees, users, roles ===== */
const Org = {
  createDepartment(data) {
    Perms.assert('org', 'create');
    if (!data.name || !data.name.trim()) throw new Error(t('required'));
    if (data.parentId) {
      const parent = U.byId(Store.state.departments, data.parentId);
      if (!parent) throw new Error(t('invalidValue'));
    }
    const dept = {
      id: U.uid('dept'), seq: Store.nextSeq('dept'),
      name: data.name.trim(), parentId: data.parentId || null,
      managerEmployeeId: data.managerEmployeeId || null,
      createdAt: U.nowISO()
    };
    Store.state.departments.push(dept);
    Store.audit('createDepartment', 'department:' + dept.id, null, dept.name);
    Store.markDirty();
    return dept;
  },
  updateDepartment(id, data) {
    const dept = U.byId(Store.state.departments, id);
    if (!dept) throw new Error(t('notFound'));
    Perms.assert('org', 'edit', { departmentId: dept.id });
    if (!data.name || !data.name.trim()) throw new Error(t('required'));
    if (data.parentId === dept.id) throw new Error(t('circularRef'));
    if (data.parentId) {
      let p = U.byId(Store.state.departments, data.parentId);
      if (!p) throw new Error(t('invalidValue'));
      while (p) {
        if (p.id === dept.id) throw new Error(t('circularRef'));
        p = U.byId(Store.state.departments, p.parentId);
      }
    }
    const prev = dept.name;
    dept.name = data.name.trim();
    dept.parentId = data.parentId || null;
    dept.managerEmployeeId = data.managerEmployeeId || null;
    Store.audit('updateDepartment', 'department:' + dept.id, prev, dept.name);
    Store.markDirty();
    return dept;
  },
  deleteDepartment(id) {
    const dept = U.byId(Store.state.departments, id);
    if (!dept) throw new Error(t('notFound'));
    Perms.assert('org', 'delete', { departmentId: dept.id });
    if (Store.state.departments.some(d => d.parentId === id)) throw new Error(t('invalidValue'));
    if (Store.state.employees.some(e => e.departmentId === id && e.status === 'active')) throw new Error(t('invalidValue'));
    Store.state.teams.filter(tm => tm.departmentId === id).forEach(tm => tm.departmentId = null);
    Store.state.departments = Store.state.departments.filter(d => d.id !== id);
    Store.audit('deleteDepartment', 'department:' + id, dept.name, null);
    Store.markDirty();
  },
  createTeam(data) {
    Perms.assert('org', 'create');
    if (!data.name || !data.name.trim()) throw new Error(t('required'));
    const team = {
      id: U.uid('team'), seq: Store.nextSeq('team'),
      name: data.name.trim(), departmentId: data.departmentId || null,
      leadEmployeeId: data.leadEmployeeId || null,
      createdAt: U.nowISO()
    };
    Store.state.teams.push(team);
    Store.audit('createTeam', 'team:' + team.id, null, team.name);
    Store.markDirty();
    return team;
  },
  updateTeam(id, data) {
    const team = U.byId(Store.state.teams, id);
    if (!team) throw new Error(t('notFound'));
    Perms.assert('org', 'edit', { departmentId: team.departmentId });
    if (!data.name || !data.name.trim()) throw new Error(t('required'));
    team.name = data.name.trim();
    team.departmentId = data.departmentId || null;
    team.leadEmployeeId = data.leadEmployeeId || null;
    Store.audit('updateTeam', 'team:' + team.id, null, team.name);
    Store.markDirty();
    return team;
  },
  deleteTeam(id) {
    const team = U.byId(Store.state.teams, id);
    if (!team) throw new Error(t('notFound'));
    Perms.assert('org', 'delete', { departmentId: team.departmentId });
    if (Store.state.employees.some(e => e.teamId === id && e.status === 'active')) throw new Error(t('invalidValue'));
    Store.state.teams = Store.state.teams.filter(x => x.id !== id);
    Store.audit('deleteTeam', 'team:' + id, team.name, null);
    Store.markDirty();
  },
  deptTree() {
    const depts = Store.state.departments;
    const children = id => depts.filter(d => (d.parentId || null) === id);
    return children(null);
  }
};

const Employees = {
  create(data) {
    Perms.assert('employees', 'create');
    if (!data.fullName || !data.fullName.trim()) throw new Error(t('required'));
    if (!data.empNo || !String(data.empNo).trim()) throw new Error(t('required'));
    if (Store.state.employees.some(e => String(e.empNo) === String(data.empNo) && e.status !== 'archived')) {
      throw new Error(t('invalidValue') + ' (' + t('employeeNo') + ')');
    }
    const emp = {
      id: U.uid('emp'), seq: Store.nextSeq('employee'),
      empNo: String(data.empNo).trim(),
      fullName: data.fullName.trim(),
      jobTitle: data.jobTitle || '',
      departmentId: data.departmentId || null,
      teamId: data.teamId || null,
      managerId: data.managerId || null,
      email: data.email || '',
      phone: data.phone || '',
      status: data.status || 'active',
      userId: null,
      createdAt: U.nowISO()
    };
    Store.state.employees.push(emp);
    Store.audit('createEmployee', 'employee:' + emp.id, null, emp.fullName);
    Store.markDirty();
    return emp;
  },
  update(id, data) {
    const emp = U.byId(Store.state.employees, id);
    if (!emp) throw new Error(t('notFound'));
    Perms.assert('employees', 'edit', emp);
    if (!data.fullName || !data.fullName.trim()) throw new Error(t('required'));
    if (Store.state.employees.some(e => String(e.empNo) === String(data.empNo) && e.id !== id && e.status !== 'archived')) {
      throw new Error(t('invalidValue') + ' (' + t('employeeNo') + ')');
    }
    if (data.managerId === id) throw new Error(t('circularRef'));
    let m = data.managerId ? U.byId(Store.state.employees, data.managerId) : null;
    while (m) {
      if (m.id === id) throw new Error(t('circularRef'));
      m = m.managerId ? U.byId(Store.state.employees, m.managerId) : null;
    }
    const prev = emp.fullName;
    emp.fullName = data.fullName.trim();
    emp.empNo = String(data.empNo).trim();
    emp.jobTitle = data.jobTitle || '';
    emp.departmentId = data.departmentId || null;
    emp.teamId = data.teamId || null;
    emp.managerId = data.managerId || null;
    emp.email = data.email || '';
    emp.phone = data.phone || '';
    if (data.status) emp.status = data.status;
    Store.audit('updateEmployee', 'employee:' + emp.id, prev, emp.fullName);
    Store.markDirty();
    return emp;
  },
  setStatus(id, status) {
    const emp = U.byId(Store.state.employees, id);
    if (!emp) throw new Error(t('notFound'));
    Perms.assert('employees', status === 'archived' ? 'archive' : 'edit', emp);
    emp.status = status;
    Store.audit(status === 'archived' ? 'archiveEmployee' : 'updateEmployeeStatus', 'employee:' + emp.id, null, status);
    Store.markDirty();
    return emp;
  },
  delete(id) {
    const emp = U.byId(Store.state.employees, id);
    if (!emp) throw new Error(t('notFound'));
    Perms.assert('employees', 'delete', emp);
    if (Store.state.employees.some(e => e.managerId === id && e.status === 'active')) throw new Error(t('invalidValue'));
    const user = Store.state.users.find(u => u.employeeId === id);
    if (user) user.employeeId = null;
    Store.state.employees = Store.state.employees.filter(e => e.id !== id);
    Store.audit('deleteEmployee', 'employee:' + id, emp.fullName, null);
    Store.markDirty();
  },
  displayName(emp) { return emp ? emp.fullName : t('unassigned'); },
  get(id) { return U.byId(Store.state.employees, id); },
  active() { return Store.state.employees.filter(e => e.status === 'active'); },
  workload(empId) {
    return Store.state.tasks.filter(x => (x.assigneeIds || []).includes(empId) && Workflow.kindOf('task', x.status) !== 'done' && Workflow.kindOf('task', x.status) !== 'cancelled' && !x.archived).length;
  }
};

const Users = {
  create(data) {
    Perms.assert('users', 'create');
    const un = String(data.username || '').trim().toLowerCase();
    if (!un || !/^[a-z0-9.]{3,32}$/.test(un)) throw new Error(t('usernameRules'));
    if (Store.state.users.some(u => u.username.toLowerCase() === un)) throw new Error(t('usernameTaken'));
    if (!data.password || data.password.length < 6) throw new Error(t('passwordTooShort'));
    const { salt, hash } = Passwords.make(data.password);
    const user = {
      id: U.uid('usr'), seq: Store.nextSeq('user'),
      username: un,
      displayName: data.displayName || un,
      salt, passHash: hash,
      roles: (data.roles && data.roles.length ? data.roles : ['role-emp']),
      employeeId: data.employeeId || null,
      status: 'active',
      overrides: { grants: [], denies: [] },
      createdAt: U.nowISO(),
      lastLogin: null
    };
    if (user.employeeId) this.checkEmployeeLink(user.employeeId, null);
    Store.state.users.push(user);
    Store.audit('createUser', 'user:' + user.id, null, user.username);
    Store.markDirty();
    return user;
  },
  checkEmployeeLink(employeeId, exceptUserId) {
    if (Store.state.users.some(u => u.employeeId === employeeId && u.id !== exceptUserId)) {
      throw new Error(t('invalidValue') + ' (' + t('linkEmployee') + ')');
    }
  },
  update(id, data) {
    const user = U.byId(Store.state.users, id);
    if (!user) throw new Error(t('notFound'));
    Perms.assert('users', 'edit', user);
    const actor = Auth.currentUser();
    const wasAdmin = Perms.isOrgAdmin(user);
    if (data.displayName) user.displayName = data.displayName;
    if (data.roles !== undefined) {
      if (!Array.isArray(data.roles) || !data.roles.length) throw new Error(t('required'));
      if (wasAdmin && !data.roles.some(r => ['role-admin', 'role-orgadmin'].includes(r))) {
        this.guardLastAdmin(user);
      }
      for (const rid of data.roles) {
        if (!U.byId(Store.state.roles, rid)) throw new Error(t('invalidValue') + ' (' + t('role') + ')');
      }
      user.roles = data.roles;
      Store.audit('changeRoles', 'user:' + user.id, null, data.roles.join(','));
    }
    if (data.employeeId !== undefined) {
      if (data.employeeId) this.checkEmployeeLink(data.employeeId, user.id);
      user.employeeId = data.employeeId || null;
    }
    if (data.status !== undefined) {
      if (user.status === 'active' && data.status !== 'active' && Perms.isOrgAdmin(user)) this.guardLastAdmin(user);
      user.status = data.status;
    }
    Store.audit('updateUser', 'user:' + user.id, null, user.username);
    Store.markDirty();
    return user;
  },
  guardLastAdmin(changedUser) {
    const activeAdmins = Store.state.users.filter(u =>
      u.status === 'active' && u.id !== changedUser.id && Perms.isOrgAdmin(u));
    if (!activeAdmins.length) throw new Error(t('lastAdminError'));
  },
  setStatus(id, status) {
    const user = U.byId(Store.state.users, id);
    if (!user) throw new Error(t('notFound'));
    Perms.assert('users', 'edit', user);
    if (user.status === 'active' && status !== 'active' && Perms.isOrgAdmin(user)) this.guardLastAdmin(user);
    if (user.id === Auth.currentUserId() && status !== 'active') throw new Error(t('lastAdminError'));
    user.status = status;
    Store.audit(status === 'disabled' ? 'disableUser' : 'enableUser', 'user:' + user.id, null, status);
    Store.markDirty();
    return user;
  },
  setOverrides(id, ov) {
    const user = U.byId(Store.state.users, id);
    if (!user) throw new Error(t('notFound'));
    Perms.assert('users', 'edit', user);
    const grants = [], denies = [];
    for (const g of (ov && ov.grants) || []) {
      this.validateOverride(g);
      grants.push({ module: g.module, op: g.op, scope: g.scope });
    }
    for (const d of (ov && ov.denies) || []) {
      this.validateOverride(d, true);
      denies.push({ module: d.module, op: d.op, scope: 'none' });
    }
    user.overrides = { grants, denies };
    Store.audit('setOverrides', 'user:' + user.id,
      JSON.stringify({ g: (ov && ov.grants || []).length, d: (ov && ov.denies || []).length }),
      JSON.stringify({ g: grants.length, d: denies.length }));
    Store.markDirty();
    return user;
  },
  validateOverride(entry, isDeny) {
    const mod = Perms.MODULES.find(m => m.id === entry.module);
    if (!mod) throw new Error(t('invalidValue') + ' (' + t('module') + ')');
    if (!mod.ops.includes(entry.op)) throw new Error(t('invalidValue') + ' (' + t('operation') + ')');
    const scopes = isDeny ? Perms.SCOPES.concat(['none']) : Perms.SCOPES;
    if (!scopes.includes(entry.scope)) throw new Error(t('invalidValue') + ' (' + t('scope') + ')');
  },
  delete(id) {
    const user = U.byId(Store.state.users, id);
    if (!user) throw new Error(t('notFound'));
    Perms.assert('users', 'delete', user);
    if (Perms.isOrgAdmin(user)) this.guardLastAdmin(user);
    if (user.id === Auth.currentUserId()) throw new Error(t('lastAdminError'));
    Store.state.users = Store.state.users.filter(u => u.id !== id);
    Store.audit('deleteUser', 'user:' + id, user.username, null);
    Store.markDirty();
  },
  displayName(user) {
    if (!user) return t('unassigned');
    const emp = user.employeeId ? U.byId(Store.state.employees, user.employeeId) : null;
    return emp ? emp.fullName : (user.displayName || user.username);
  }
};

const Roles = {
  create(data) {
    Perms.assert('roles', 'create');
    if (!data.nameFa || !data.nameFa.trim()) throw new Error(t('required'));
    const role = {
      id: U.uid('role'), seq: Store.nextSeq('role'),
      nameFa: data.nameFa.trim(), nameEn: (data.nameEn || data.nameFa).trim(),
      description: data.description || '',
      system: false,
      perms: data.perms || {}
    };
    Store.state.roles.push(role);
    Store.audit('createRole', 'role:' + role.id, null, role.nameFa);
    Store.markDirty();
    return role;
  },
  update(id, data) {
    const role = U.byId(Store.state.roles, id);
    if (!role) throw new Error(t('notFound'));
    Perms.assert('roles', 'edit');
    if (role.system && data.perms !== undefined && !Perms.isAdmin(Auth.currentUser())) {
      throw new Error('permDenied');
    }
    if (data.nameFa) role.nameFa = data.nameFa.trim();
    if (data.nameEn) role.nameEn = data.nameEn.trim();
    if (data.description !== undefined) role.description = data.description;
    if (data.perms !== undefined) {
      role.perms = data.perms;
      Store.audit('updateRolePerms', 'role:' + role.id, null, JSON.stringify(Object.keys(data.perms)));
    }
    Store.markDirty();
    return role;
  },
  delete(id) {
    const role = U.byId(Store.state.roles, id);
    if (!role) throw new Error(t('notFound'));
    Perms.assert('roles', 'delete');
    if (role.system) throw new Error(t('invalidValue'));
    if (Store.state.users.some(u => (u.roles || []).includes(id))) throw new Error(t('invalidValue'));
    Store.state.roles = Store.state.roles.filter(r => r.id !== id);
    Store.audit('deleteRole', 'role:' + id, role.nameFa, null);
    Store.markDirty();
  },
  label(role) {
    if (role.key) return t(role.key);
    return I18N.getLang() === 'fa' ? role.nameFa : role.nameEn;
  },
  roleLabelById(id) {
    const r = U.byId(Store.state.roles, id);
    return r ? this.label(r) : id;
  }
};
