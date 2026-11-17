/* ===== Backup, migration engine, restore ===== */
const BACKUP_FORMAT_VERSION = 1;

const Migrations = {
  list: [
    {
      from: 1, to: 2,
      description: 'Add announcements collection (Atlas-patch1 schema)',
      run(data) {
        if (!data.announcements) data.announcements = [];
        return data;
      }
    }
  ],
  apply(data, targetVersion) {
    let v = data.meta && data.meta.schemaVersion ? data.meta.schemaVersion : 1;
    const applied = [];
    while (v < targetVersion) {
      const m = this.list.find(x => x.from === v);
      if (!m) throw new Error('No migration from schema ' + v);
      m.run(data);
      v = m.to;
      applied.push({ from: m.from, to: m.to, description: m.description, at: U.nowISO() });
    }
    data.meta.schemaVersion = targetVersion;
    if (data.meta.migrationHistory) data.meta.migrationHistory.push(...applied);
    else data.meta.migrationHistory = applied;
    return applied;
  },
  canRestore(sourceVersion) {
    let v = sourceVersion;
    while (v < SCHEMA_VERSION) {
      const m = this.list.find(x => x.from === v);
      if (!m) return { ok: false, at: v };
      v = m.to;
    }
    return { ok: true, from: sourceVersion, to: SCHEMA_VERSION };
  }
};

const Backup = {
  COLLECTIONS: ['users', 'roles', 'employees', 'departments', 'teams', 'projects', 'tasks', 'milestones', 'notifications', 'auditLog', 'customFields', 'announcements', 'patchHistory'],

  create() {
    const s = Store.state;
    const backup = {
      format: 'atlas-backup',
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: APP_VERSION,
      schemaVersion: s.meta.schemaVersion,
      createdAt: U.nowISO(),
      inventory: {},
      integrity: { recordCount: 0 },
      data: {}
    };
    let count = 0;
    this.COLLECTIONS.forEach(c => {
      const arr = Array.isArray(s[c]) ? s[c] : [];
      backup.data[c] = U.clone(arr);
      backup.inventory[c] = arr.length;
      count += arr.length;
    });
    backup.data.settings = U.clone(s.settings);
    backup.data.workflow = U.clone(s.workflow);
    backup.data.statuses = U.clone(s.statuses);
    backup.data.priorities = U.clone(s.priorities);
    backup.data.customFields = U.clone(s.customFields || []);
    backup.data.meta = U.clone(s.meta);
    backup.data.activePatchPayloads = U.clone(s.activePatchPayloads || {});
    backup.inventory.settings = 1;
    backup.inventory.activePatchPayloads = Object.keys(backup.data.activePatchPayloads).length;
    backup.integrity.recordCount = count;
    backup.integrity.checksum = SHA256(JSON.stringify(backup.data));
    return backup;
  },

  validate(backup) {
    if (!backup || typeof backup !== 'object') return { ok: false, msg: 'not an object' };
    if (backup.format !== 'atlas-backup') return { ok: false, msg: 'format' };
    if (typeof backup.formatVersion !== 'number') return { ok: false, msg: 'formatVersion' };
    if (backup.formatVersion > BACKUP_FORMAT_VERSION) return { ok: false, msg: 'formatVersion too new: ' + backup.formatVersion };
    if (!backup.data || typeof backup.data !== 'object') return { ok: false, msg: 'data' };
    if (!backup.data.meta || typeof backup.data.meta.schemaVersion !== 'number') return { ok: false, msg: 'schemaVersion' };
    if (backup.integrity && backup.integrity.checksum) {
      const actual = SHA256(JSON.stringify(backup.data));
      if (actual !== backup.integrity.checksum) return { ok: false, msg: 'checksum' };
    }
    return { ok: true };
  },

  compat(backup) {
    const sv = backup.data.meta.schemaVersion;
    const m = Migrations.canRestore(sv);
    if (!m.ok) return { ok: false, msg: 'schema ' + sv };
    return { ok: true, migration: m.from < m.to, from: m.from, to: m.to };
  },

  /* staged, transactional restore with automatic recovery checkpoint */
  restore(backup, opts) {
    opts = opts || {};
    const check = this.validate(backup);
    if (!check.ok) throw new Error(t('backupInvalid', { msg: check.msg }));
    const compat = this.compat(backup);
    if (!compat.ok) throw new Error(t('backupIncompatible'));

    const checkpoint = this.create();
    const prev = U.clone(Store.state);
    try {
      const restored = Store.fresh();
      restored.meta = U.clone(backup.data.meta);
      this.COLLECTIONS.forEach(c => {
        if (Array.isArray(backup.data[c])) restored[c] = U.clone(backup.data[c]);
      });
      restored.settings = Object.assign({}, Store.fresh().settings, U.clone(backup.data.settings) || {});
      restored.workflow = Object.assign({}, Store.fresh().workflow, U.clone(backup.data.workflow) || {});
      restored.statuses = U.clone(backup.data.statuses) || Store.defaultStatuses();
      restored.priorities = U.clone(backup.data.priorities) || Store.defaultPriorities();
      restored.counters = U.clone(backup.data.counters) || Store.fresh().counters;
      restored.meta.installedPatches = U.clone((backup.data.meta && backup.data.meta.installedPatches) || []);
      restored.patchHistory = U.clone(backup.data.patchHistory) || [];
      restored.activePatchPayloads = U.clone(backup.data.activePatchPayloads) || {};

      if (compat.migration) {
        Migrations.apply(restored, SCHEMA_VERSION);
      }
      /* referential check */
      this.verify(restored);
      Store.state = restored;
      Store.persist();
      return { ok: true, checkpoint, migrated: compat.migration, counts: backup.inventory };
    } catch (e) {
      Store.state = prev;
      Store.persist();
      throw e;
    }
  },

  verify(s) {
    const userIds = new Set(s.users.map(u => u.id));
    const roleIds = new Set(s.roles.map(r => r.id));
    const empIds = new Set(s.employees.map(e => e.id));
    const projIds = new Set(s.projects.map(p => p.id));
    const taskIds = new Set(s.tasks.map(x => x.id));
    s.users.forEach(u => {
      (u.roles || []).forEach(r => { if (!roleIds.has(r)) throw new Error('broken role ref: ' + r); });
      if (u.employeeId && !empIds.has(u.employeeId)) u.employeeId = null;
    });
    s.employees.forEach(e => {
      if (e.departmentId && !s.departments.some(d => d.id === e.departmentId)) e.departmentId = null;
      if (e.teamId && !s.teams.some(tm => tm.id === e.teamId)) e.teamId = null;
      if (e.managerId && !empIds.has(e.managerId)) e.managerId = null;
    });
    s.projects.forEach(p => {
      if (p.managerEmployeeId && !empIds.has(p.managerEmployeeId)) p.managerEmployeeId = null;
      p.memberIds = (p.memberIds || []).filter(id => empIds.has(id));
      if (p.departmentId && !s.departments.some(d => d.id === p.departmentId)) p.departmentId = null;
    });
    s.tasks.forEach(x => {
      if (x.projectId && !projIds.has(x.projectId)) x.projectId = null;
      if (x.parentId && !taskIds.has(x.parentId)) x.parentId = null;
      x.deps = (x.deps || []).filter(d => taskIds.has(d) && d !== x.id);
      x.assigneeIds = (x.assigneeIds || []).filter(id => empIds.has(id));
    });
    s.milestones = (s.milestones || []).filter(m => projIds.has(m.projectId));
    return true;
  }
};
