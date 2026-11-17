/* ===== Models: projects, tasks, milestones, notifications ===== */
const Workflow = {
  statuses(kind) { return Store.state.statuses[kind] || []; },
  status(kind, id) { return this.statuses(kind).find(s => s.id === id) || null; },
  statusLabel(kind, id) {
    const s = this.status(kind, id);
    if (!s) return id;
    return I18N.getLang() === 'fa' ? s.fa : s.en;
  },
  kindOf(kind, statusId) {
    const s = this.status(kind, statusId);
    return s ? s.kind : 'active';
  },
  transitions(kind) { return (Store.state.workflow[kind] || {}).transitions || {}; },
  canTransition(kind, from, to) {
    if (from === to) return true;
    return (this.transitions(kind)[from] || []).includes(to);
  },
  validate(kind, from, to, record) {
    if (!this.status(kind, to)) throw new Error(t('invalidValue'));
    if (!this.canTransition(kind, from, to)) throw new Error(t('invalidTransition'));
    const wf = Store.state.workflow[kind] || {};
    if (wf.requireResultOnDone && this.kindOf(kind, to) === 'done') {
      if (!record.resultSummary || !String(record.resultSummary).trim()) throw new Error(t('resultSummary') + ': ' + t('required'));
    }
  },
  stages(kind) { return (Store.state.workflow[kind] || {}).stages || []; },
  saveConfig(kind, cfg) {
    Perms.assert('workflow', 'configure');
    Store.state.workflow[kind] = cfg;
    Store.audit('updateWorkflow', 'workflow:' + kind, null, null);
    Store.markDirty();
  }
};

const Priorities = {
  list() { return Store.state.priorities || []; },
  label(id) {
    const p = this.list().find(x => x.id === id);
    if (!p) return id || '—';
    return I18N.getLang() === 'fa' ? p.fa : p.en;
  },
  level(id) {
    const p = this.list().find(x => x.id === id);
    return p ? p.level : 0;
  }
};

const Notifications = {
  push(userId, type, refType, refId, params) {
    if (!userId) return;
    const target = U.byId(Store.state.users, userId);
    if (!target || target.status !== 'active') return;
    Store.state.notifications.push({
      id: U.uid('ntf'), at: U.nowISO(),
      userId, type, refType: refType || null, refId: refId || null,
      params: params || {}, read: false
    });
    if (Store.state.notifications.length > 3000) Store.state.notifications.splice(0, Store.state.notifications.length - 3000);
  },
  notifyUsers(userIds, type, refType, refId, params) {
    (userIds || []).forEach(id => this.push(id, type, refType, refId, params));
    Store.markDirty();
  },
  forCurrentUser() {
    const uid = Auth.currentUserId();
    return Store.state.notifications.filter(n => n.userId === uid).sort((a, b) => U.cmp(b.at, a.at));
  },
  unreadCount() {
    const uid = Auth.currentUserId();
    return Store.state.notifications.filter(n => n.userId === uid && !n.read).length;
  },
  markRead(id) {
    const n = U.byId(Store.state.notifications, id);
    if (n && n.userId === Auth.currentUserId()) { n.read = true; Store.markDirty(); }
  },
  markAllRead() {
    const uid = Auth.currentUserId();
    Store.state.notifications.forEach(n => { if (n.userId === uid) n.read = true; });
    Store.markDirty();
  },
  label(n) {
    const key = 'notif_' + n.type;
    return t(key, n.params || {});
  }
};

const Projects = {
  create(data) {
    Perms.assert('projects', 'create');
    if (!data.title || !data.title.trim()) throw new Error(t('required'));
    this.validateDates(data);
    const p = {
      id: U.uid('prj'), seq: Store.nextSeq('project'),
      title: data.title.trim(),
      description: data.description || '',
      objectives: data.objectives || '',
      managerEmployeeId: data.managerEmployeeId || null,
      memberIds: data.memberIds || [],
      departmentId: data.departmentId || null,
      teamId: data.teamId || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      targetDate: data.targetDate || null,
      priority: data.priority || 'medium',
      status: data.status || Store.state.settings.defaultProjectStatus || 'active',
      tags: data.tags || [],
      archived: false,
      createdAt: U.nowISO(),
      createdBy: Auth.currentUserId()
    };
    Store.state.projects.push(p);
    Store.audit('createProject', 'project:' + p.id, null, p.title);
    Store.markDirty();
    return p;
  },
  validateDates(data) {
    for (const k of ['startDate', 'endDate', 'targetDate']) {
      if (data[k] && !Cal.parseISO(data[k])) throw new Error(t('invalidValue') + ' (' + t(k === 'targetDate' ? 'targetDate' : k) + ')');
    }
    if (data.startDate && data.endDate && Cal.diffDays(data.endDate, data.startDate) < 0) {
      throw new Error(t('invalidValue') + ' (' + t('endDate') + ')');
    }
  },
  update(id, data) {
    const p = this.get(id);
    Perms.assert('projects', 'edit', p);
    if (!data.title || !data.title.trim()) throw new Error(t('required'));
    this.validateDates(data);
    const prev = p.title;
    p.title = data.title.trim();
    p.description = data.description || '';
    p.objectives = data.objectives || '';
    p.managerEmployeeId = data.managerEmployeeId || null;
    const oldMembers = p.memberIds || [];
    p.memberIds = data.memberIds || [];
    p.departmentId = data.departmentId || null;
    p.teamId = data.teamId || null;
    p.startDate = data.startDate || null;
    p.endDate = data.endDate || null;
    p.targetDate = data.targetDate || null;
    p.priority = data.priority || 'medium';
    if (data.status && data.status !== p.status) {
      Workflow.validate('project', p.status, data.status, p);
      p.status = data.status;
    }
    p.tags = data.tags || [];
    Store.audit('updateProject', 'project:' + p.id, prev, p.title);
    const added = p.memberIds.filter(m => !oldMembers.includes(m));
    if (added.length) {
      Notifications.notifyUsers(
        added.map(eid => { const e = Employees.get(eid); return e ? e.userId : null; }).filter(Boolean),
        'projectChange', 'project', p.id, { title: p.title }
      );
    }
    Store.markDirty();
    return p;
  },
  get(id) {
    const p = U.byId(Store.state.projects, id);
    if (!p) throw new Error(t('notFound'));
    Perms.assert('projects', 'view', p);
    return p;
  },
  visible() { return Perms.visible('projects', Store.state.projects.filter(p => !p.archived)); },
  archivedList() { return Perms.visible('projects', Store.state.projects.filter(p => p.archived)); },
  setArchived(id, archived) {
    const p = this.get(id);
    Perms.assert('projects', archived ? 'archive' : 'restore', p);
    p.archived = archived;
    Store.audit(archived ? 'archiveProject' : 'restoreProject', 'project:' + p.id, null, p.title);
    Store.markDirty();
    return p;
  },
  delete(id) {
    const p = this.get(id);
    Perms.assert('projects', 'delete', p);
    const taskIds = Store.state.tasks.filter(x => x.projectId === id).map(x => x.id);
    Store.state.tasks = Store.state.tasks.filter(x => x.projectId !== id);
    Store.state.projects = Store.state.projects.filter(x => x.id !== id);
    Store.audit('deleteProject', 'project:' + id, p.title, null);
    Store.markDirty();
    return taskIds.length;
  },
  progress(p) {
    const tasks = Store.state.tasks.filter(x => x.projectId === p.id && !x.archived && !x.parentId);
    if (!tasks.length) {
      return Workflow.kindOf('project', p.status) === 'done' ? 100 : 0;
    }
    const sum = tasks.reduce((acc, x) => acc + U.num(x.progress), 0);
    return Math.round(sum / tasks.length);
  },
  isDelayed(p) {
    if (Workflow.kindOf('project', p.status) === 'done') return false;
    const today = Cal.todayISO();
    if (p.endDate && Cal.diffDays(today, p.endDate) > 0) return true;
    if (p.targetDate && Cal.diffDays(today, p.targetDate) > 0) return true;
    return false;
  },
  addMilestone(projectId, m) {
    const p = this.get(projectId);
    Perms.assert('projects', 'edit', p);
    if (!m.title || !m.title.trim()) throw new Error(t('required'));
    if (m.dueDate && !Cal.parseISO(m.dueDate)) throw new Error(t('invalidValue'));
    const ms = {
      id: U.uid('ms'), title: m.title.trim(),
      dueDate: m.dueDate || null, done: !!m.done,
      createdAt: U.nowISO()
    };
    Store.state.milestones.push(Object.assign({ projectId: p.id }, ms));
    Store.audit('createMilestone', 'milestone:' + ms.id, null, ms.title);
    Store.markDirty();
    return ms;
  },
  toggleMilestone(mid) {
    const ms = U.byId(Store.state.milestones, mid);
    if (!ms) throw new Error(t('notFound'));
    const p = this.get(ms.projectId);
    Perms.assert('projects', 'edit', p);
    ms.done = !ms.done;
    ms.doneAt = ms.done ? U.nowISO() : null;
    Store.markDirty();
    return ms;
  },
  deleteMilestone(mid) {
    const ms = U.byId(Store.state.milestones, mid);
    if (!ms) throw new Error(t('notFound'));
    const p = this.get(ms.projectId);
    Perms.assert('projects', 'edit', p);
    Store.state.milestones = Store.state.milestones.filter(x => x.id !== mid);
    Store.markDirty();
  },
  projectMilestones(projectId) { return Store.state.milestones.filter(m => m.projectId === projectId); }
};

const Tasks = {
  create(data) {
    Perms.assert('tasks', 'create', data.parentId ? this.raw(data.parentId) : null);
    if (!data.title || !data.title.trim()) throw new Error(t('required'));
    if (data.projectId && !this.projectVisible(data.projectId)) throw new Error('permDenied');
    if (data.dueDate && !Cal.parseISO(data.dueDate)) throw new Error(t('invalidValue'));
    if (data.startDate && !Cal.parseISO(data.startDate)) throw new Error(t('invalidValue'));
    const task = {
      id: U.uid('tsk'), seq: Store.nextSeq('task'),
      title: data.title.trim(),
      description: data.description || '',
      projectId: data.projectId || null,
      parentId: data.parentId || null,
      creatorId: Auth.currentUserId(),
      assigneeIds: data.assigneeIds || [],
      reviewerId: data.reviewerId || null,
      priority: data.priority || 'medium',
      status: data.status || Store.state.settings.defaultTaskStatus || 'todo',
      stage: data.stage || '',
      progress: 0,
      startDate: data.startDate || null,
      dueDate: data.dueDate || null,
      completedAt: null,
      resultSummary: '',
      tags: data.tags || [],
      custom: data.custom || {},
      deps: data.deps || [],
      attachments: [],
      comments: [],
      updates: [],
      history: [],
      archived: false,
      createdAt: U.nowISO()
    };
    this.addHistory(task, 'create', { title: task.title });
    Store.state.tasks.push(task);
    Store.audit('createTask', 'task:' + task.id, null, task.title);
    this.notifyAssignees(task, 'taskAssigned', (task.assigneeIds || []));
    Store.markDirty();
    return task;
  },
  projectVisible(projectId) {
    const p = U.byId(Store.state.projects, projectId);
    return p && Perms.can('projects', 'view', p);
  },
  raw(id) { return U.byId(Store.state.tasks, id); },
  get(id) {
    const x = this.raw(id);
    if (!x) throw new Error(t('notFound'));
    Perms.assert('tasks', 'view', x);
    return x;
  },
  visible() { return Perms.visible('tasks', Store.state.tasks.filter(x => !x.archived)); },
  addHistory(task, action, details) {
    task.history = task.history || [];
    task.history.push({ at: U.nowISO(), actorId: Auth.currentUserId(), action, details: details || {} });
    if (task.history.length > 300) task.history.splice(0, task.history.length - 300);
  },
  notifyAssignees(task, type, onlyIds) {
    const ids = onlyIds || task.assigneeIds || [];
    const userIds = ids.map(eid => {
      const e = Employees.get(eid);
      return e && e.userId ? e.userId : null;
    }).filter(id => id && id !== Auth.currentUserId());
    Notifications.notifyUsers(userIds, type, 'task', task.id, { title: task.title });
  },
  update(id, data) {
    const task = this.get(id);
    Perms.assert('tasks', 'edit', task);
    if (!data.title || !data.title.trim()) throw new Error(t('required'));
    if (data.dueDate && !Cal.parseISO(data.dueDate)) throw new Error(t('invalidValue'));
    const prevAssignees = task.assigneeIds || [];
    task.title = data.title.trim();
    task.description = data.description || '';
    if (data.projectId !== undefined) task.projectId = data.projectId || null;
    task.assigneeIds = data.assigneeIds || [];
    task.reviewerId = data.reviewerId || null;
    task.priority = data.priority || task.priority;
    if (data.stage !== undefined) task.stage = data.stage;
    if (data.startDate !== undefined) task.startDate = data.startDate || null;
    if (data.dueDate !== undefined) task.dueDate = data.dueDate || null;
    if (data.tags !== undefined) task.tags = data.tags || [];
    if (data.custom !== undefined) task.custom = data.custom || {};
    if (data.deps !== undefined) {
      if ((data.deps || []).includes(task.id)) throw new Error(t('invalidValue'));
      task.deps = data.deps || [];
    }
    if (data.status && data.status !== task.status) this.setStatus(task, data.status, { viaEdit: true });
    if (data.resultSummary !== undefined) task.resultSummary = data.resultSummary;
    this.addHistory(task, 'update', {});
    const added = task.assigneeIds.filter(a => !prevAssignees.includes(a));
    if (added.length) this.notifyAssignees(task, 'taskReassigned', added);
    Store.audit('updateTask', 'task:' + task.id, null, task.title);
    Store.markDirty();
    return task;
  },
  setStatus(task, statusId, opts) {
    opts = opts || {};
    if (!opts.skipPerm) Perms.assert('tasks', 'edit', task);
    const from = task.status;
    Workflow.validate('task', from, statusId, task);
    task.status = statusId;
    const kind = Workflow.kindOf('task', statusId);
    if (kind === 'done') {
      task.completedAt = U.nowISO();
      task.progress = 100;
    } else if (from && Workflow.kindOf('task', from) === 'done' && kind !== 'done') {
      task.completedAt = null;
      if (U.num(task.progress) >= 100) task.progress = 90;
    }
    this.addHistory(task, 'status', { from, to: statusId });
    Store.audit('taskStatus', 'task:' + task.id, from, statusId);
    const reviewer = task.reviewerId ? Employees.get(task.reviewerId) : null;
    if (reviewer && reviewer.userId && statusId === 'review') {
      Notifications.push(reviewer.userId, 'approval', 'task', task.id, { title: task.title });
    }
    Store.markDirty();
    return task;
  },
  /* checkbox auto-completion */
  setCompleted(id, completed) {
    const task = this.get(id);
    if (completed) {
      const wf = Store.state.workflow.task || {};
      if (wf.requireResultOnDone && !(task.resultSummary || '').trim()) {
        const err = new Error(t('resultSummary') + ': ' + t('required'));
        err.code = 'resultRequired';
        throw err;
      }
      const doneId = this.doneStatusId();
      if (!Workflow.canTransition('task', task.status, doneId)) {
        const staged = (Workflow.transitions('task')[task.status] || []).find(s => Workflow.kindOf('task', s) === 'active');
        if (staged) this.setStatus(task, staged, { skipPerm: true });
      }
      this.setStatus(task, doneId, { skipPerm: true });
      this.addHistory(task, 'complete', {});
      Store.audit('completeTask', 'task:' + task.id, null, task.title);
    } else {
      this.reopen(task);
    }
    Store.markDirty();
    return task;
  },
  doneStatusId() {
    const s = Store.state.statuses.task.find(x => x.kind === 'done');
    return s ? s.id : 'done';
  },
  reopen(task) {
    if (Workflow.kindOf('task', task.status) !== 'done') return task;
    const allowed = (Workflow.transitions('task')[task.status] || []).find(s => Workflow.kindOf('task', s) === 'active');
    const to = allowed || 'inprogress';
    Workflow.validate('task', task.status, to, task);
    task.status = to;
    task.completedAt = null;
    if (U.num(task.progress) >= 100) task.progress = 90;
    this.addHistory(task, 'reopen', { to });
    Store.audit('reopenTask', 'task:' + task.id, null, task.title);
    Store.markDirty();
    return task;
  },
  assign(id, assigneeIds) {
    const task = this.get(id);
    Perms.assert('tasks', 'assign', task);
    const prev = task.assigneeIds || [];
    task.assigneeIds = assigneeIds || [];
    this.addHistory(task, 'assign', { from: prev, to: task.assigneeIds });
    this.notifyAssignees(task, 'taskAssigned', task.assigneeIds.filter(a => !prev.includes(a)));
    Store.audit('assignTask', 'task:' + task.id, prev.join(','), task.assigneeIds.join(','));
    Store.markDirty();
    return task;
  },
  addProgressUpdate(id, upd) {
    const task = this.get(id);
    const isSelf = (task.assigneeIds || []).includes(Auth.currentUser() && Auth.currentUser().employeeId);
    if (!(isSelf || Perms.can('tasks', 'edit', task))) throw new Error('permDenied');
    if (!upd.description || !upd.description.trim()) throw new Error(t('required'));
    const progress = U.clamp(U.num(upd.progress, task.progress), 0, 100);
    const entry = {
      id: U.uid('upd'), at: U.nowISO(),
      authorId: Auth.currentUserId(),
      description: upd.description.trim(),
      progress,
      stage: upd.stage !== undefined ? upd.stage : task.stage,
      status: upd.status || null,
      result: upd.result || '',
      problems: upd.problems || '',
      nextSteps: upd.nextSteps || ''
    };
    const snapshot = U.clone(task);
    try {
      task.updates.push(entry);
      if (entry.stage !== undefined && entry.stage !== task.stage) {
        task.stage = entry.stage;
        this.addHistory(task, 'stage', { to: entry.stage });
      }
      if (entry.result) task.resultSummary = entry.result;
      if (entry.status && entry.status !== task.status) {
        this.setStatus(task, entry.status, {});
      }
      if (Workflow.kindOf('task', task.status) !== 'done') {
        task.progress = progress;
      }
      this.addHistory(task, 'progress', { progress, id: entry.id });
      const manager = task.projectId ? U.byId(Store.state.projects, task.projectId) : null;
      if (manager && manager.managerEmployeeId) {
        const me = Employees.get(manager.managerEmployeeId);
        if (me && me.userId && me.userId !== Auth.currentUserId()) {
          Notifications.push(me.userId, 'progress', 'task', task.id, { title: task.title });
        }
      }
      Store.markDirty();
      return entry;
    } catch (e) {
      const idx = Store.state.tasks.indexOf(task);
      if (idx >= 0) Store.state.tasks[idx] = snapshot;
      throw e;
    }
  },
  deleteUpdate(id, updId) {
    const task = this.get(id);
    if (!Perms.can('tasks', 'approve', task)) throw new Error('permDenied');
    const upd = U.byId(task.updates, updId);
    if (!upd) throw new Error(t('notFound'));
    task.updates = task.updates.filter(x => x.id !== updId);
    this.addHistory(task, 'deleteUpdate', { id: updId });
    Store.audit('deleteProgressUpdate', 'task:' + task.id, null, updId);
    Store.markDirty();
  },
  addComment(id, text) {
    const task = this.get(id);
    if (!text || !text.trim()) throw new Error(t('required'));
    const c = { id: U.uid('cmt'), at: U.nowISO(), authorId: Auth.currentUserId(), text: text.trim() };
    task.comments.push(c);
    this.addHistory(task, 'comment', {});
    const userIds = (task.assigneeIds || []).map(eid => {
      const e = Employees.get(eid);
      return e && e.userId ? e.userId : null;
    }).filter(uid => uid && uid !== Auth.currentUserId());
    Notifications.notifyUsers(userIds, 'comment', 'task', task.id, { title: task.title });
    Store.markDirty();
    return c;
  },
  addAttachment(id, att) {
    const task = this.get(id);
    Perms.assert('tasks', 'edit', task);
    if (!att.name || !att.content) throw new Error(t('required'));
    if (String(att.content).length > 512 * 1024) throw new Error(t('attachmentTooLarge'));
    if (/[\\/:*?"<>|]/.test(att.name) || att.name.includes('..')) throw new Error(t('invalidValue'));
    const a = { id: U.uid('att'), name: att.name, size: att.content.length, content: att.content, at: U.nowISO(), byId: Auth.currentUserId() };
    task.attachments.push(a);
    this.addHistory(task, 'attachment', { name: att.name });
    Store.markDirty();
    return a;
  },
  setProgress(id, progress) {
    const task = this.get(id);
    Perms.assert('tasks', 'edit', task);
    task.progress = U.clamp(U.num(progress), 0, 100);
    this.addHistory(task, 'progress', { progress: task.progress });
    Store.markDirty();
    return task;
  },
  isBlocked(task) {
    return (task.deps || []).some(depId => {
      const dep = this.raw(depId);
      return dep && Workflow.kindOf('task', dep.status) !== 'done' && Workflow.kindOf('task', dep.status) !== 'cancelled';
    });
  },
  isOverdue(task) {
    return !!task.dueDate && Workflow.kindOf('task', task.status) !== 'done' &&
      Workflow.kindOf('task', task.status) !== 'cancelled' && Cal.diffDays(Cal.todayISO(), task.dueDate) > 0;
  },
  delete(id) {
    const task = this.get(id);
    Perms.assert('tasks', 'delete', task);
    const childIds = Store.state.tasks.filter(x => x.parentId === id).map(x => x.id);
    Store.state.tasks = Store.state.tasks.filter(x => x.id !== id && x.parentId !== id);
    Store.state.tasks.forEach(x => { x.deps = (x.deps || []).filter(d => d !== id && !childIds.includes(d)); });
    Store.audit('deleteTask', 'task:' + id, task.title, null);
    Store.markDirty();
    return 1 + childIds.length;
  },
  setArchived(id, archived) {
    const task = this.get(id);
    Perms.assert('tasks', 'edit', task);
    task.archived = archived;
    Store.markDirty();
    return task;
  },
  subtasks(id) { return Store.state.tasks.filter(x => x.parentId === id && !x.archived); }
};
