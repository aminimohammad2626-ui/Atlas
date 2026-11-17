/* ===== Global search (permission-aware) ===== */
const Search = {
  normalize(s) { return String(s || '').toLowerCase().trim(); },
  run(q) {
    q = this.normalize(q);
    if (!q) return { projects: [], tasks: [], employees: [], users: [] };
    const out = { projects: [], tasks: [], employees: [], users: [] };
    out.projects = Perms.visible('projects', Store.state.projects).filter(p =>
      this.normalize(p.title).includes(q) || this.normalize(p.description).includes(q) ||
      (p.tags || []).some(x => this.normalize(x).includes(q))).slice(0, 20);
    out.tasks = Perms.visible('tasks', Store.state.tasks).filter(x =>
      this.normalize(x.title).includes(q) || this.normalize(x.description).includes(q) ||
      (x.tags || []).some(tag => this.normalize(tag).includes(q))).slice(0, 20);
    if (Perms.can('employees', 'view')) {
      out.employees = Store.state.employees.filter(e =>
        this.normalize(e.fullName).includes(q) || this.normalize(e.empNo).includes(q) ||
        this.normalize(e.jobTitle).includes(q)).slice(0, 20);
    }
    if (Perms.can('users', 'view')) {
      out.users = Store.state.users.filter(u =>
        this.normalize(u.username).includes(q) || this.normalize(u.displayName).includes(q)).slice(0, 20);
    }
    return out;
  }
};

/* ===== Reports ===== */
const Reports = {
  definitions() {
    return [
      { id: 'projectStatus', key: 'report_projectStatus' },
      { id: 'taskStatus', key: 'report_taskStatus' },
      { id: 'overdue', key: 'report_overdue' },
      { id: 'workload', key: 'report_workload' },
      { id: 'completion', key: 'report_completion' },
      { id: 'updates', key: 'report_updates' },
      { id: 'milestones', key: 'report_milestones' },
      { id: 'activity', key: 'report_activity' }
    ];
  },
  run(id, filters) {
    filters = filters || {};
    const today = Cal.todayISO();
    if (id === 'projectStatus') {
      const rows = Perms.visible('projects', Store.state.projects).filter(p => !filters.projectId || p.id === filters.projectId);
      return {
        head: [t('project'), t('status'), t('priority'), t('progress'), t('startDate'), t('endDate'), t('department')],
        rows: rows.map(p => [
          p.title, Workflow.statusLabel('project', p.status), Priorities.label(p.priority),
          Projects.progress(p) + '%',
          p.startDate ? Cal.formatISO(p.startDate, I18N.getLang()) : '—',
          p.endDate ? Cal.formatISO(p.endDate, I18N.getLang()) : '—',
          this.deptName(p.departmentId)
        ])
      };
    }
    if (id === 'taskStatus') {
      const rows = Perms.visible('tasks', Store.state.tasks).filter(x => !x.parentId)
        .filter(x => !filters.projectId || x.projectId === filters.projectId)
        .filter(x => !filters.employeeId || (x.assigneeIds || []).includes(filters.employeeId));
      return {
        head: [t('task'), t('project'), t('status'), t('stage'), t('progress'), t('dueDate'), t('assignee')],
        rows: rows.map(x => [
          x.title, this.projectName(x.projectId), Workflow.statusLabel('task', x.status), x.stage || '—',
          U.num(x.progress) + '%',
          x.dueDate ? Cal.formatISO(x.dueDate, I18N.getLang()) : '—',
          this.assigneeNames(x)
        ])
      };
    }
    if (id === 'overdue') {
      const rows = Perms.visible('tasks', Store.state.tasks).filter(x => Tasks.isOverdue(x));
      return {
        head: [t('task'), t('project'), t('dueDate'), t('daysLate'), t('assignee'), t('priority')],
        rows: rows.map(x => [
          x.title, this.projectName(x.projectId),
          Cal.formatISO(x.dueDate, I18N.getLang()),
          Cal.diffDays(today, x.dueDate),
          this.assigneeNames(x), Priorities.label(x.priority)
        ])
      };
    }
    if (id === 'workload') {
      const emps = Perms.visible('employees', Store.state.employees).filter(e => e.status === 'active');
      return {
        head: [t('employee'), t('employeeNo'), t('department'), t('assignedTasks'), t('overdue'), t('completed')],
        rows: emps.map(e => {
          const mine = Store.state.tasks.filter(x => (x.assigneeIds || []).includes(e.id) && !x.archived);
          return [e.fullName, e.empNo, this.deptName(e.departmentId),
            mine.filter(x => Workflow.kindOf('task', x.status) !== 'done' && Workflow.kindOf('task', x.status) !== 'cancelled').length,
            mine.filter(x => Tasks.isOverdue(x)).length,
            mine.filter(x => Workflow.kindOf('task', x.status) === 'done').length];
        })
      };
    }
    if (id === 'completion') {
      const rows = Perms.visible('tasks', Store.state.tasks).filter(x => x.completedAt);
      return {
        head: [t('task'), t('project'), t('completedAt'), t('resultSummary'), t('assignee')],
        rows: rows.sort((a, b) => U.cmp(b.completedAt, a.completedAt)).map(x => [
          x.title, this.projectName(x.projectId),
          Cal.formatTimestamp(x.completedAt, I18N.getLang(), false),
          x.resultSummary || '—', this.assigneeNames(x)
        ])
      };
    }
    if (id === 'updates') {
      const rows = [];
      Perms.visible('tasks', Store.state.tasks).forEach(x => {
        (x.updates || []).forEach(u => rows.push({ task: x, u }));
      });
      rows.sort((a, b) => U.cmp(b.u.at, a.u.at));
      return {
        head: [t('task'), t('date'), t('auditActor'), t('progress'), t('workDone'), t('problems'), t('nextSteps')],
        rows: rows.map(r => [
          r.task.title, Cal.formatTimestamp(r.u.at, I18N.getLang()),
          this.userName(r.u.authorId), r.u.progress + '%',
          r.u.description, r.u.problems || '—', r.u.nextSteps || '—'
        ])
      };
    }
    if (id === 'milestones') {
      const rows = [];
      Perms.visible('projects', Store.state.projects).forEach(p => {
        Projects.projectMilestones(p.id).forEach(m => rows.push({ p, m }));
      });
      return {
        head: [t('milestone'), t('project'), t('dueDate'), t('status')],
        rows: rows.map(r => [
          r.m.title, r.p.title,
          r.m.dueDate ? Cal.formatISO(r.m.dueDate, I18N.getLang()) : '—',
          r.m.done ? t('completed') : (r.m.dueDate && Cal.diffDays(today, r.m.dueDate) > 0 ? t('overdue') : t('pending'))
        ])
      };
    }
    if (id === 'activity') {
      const log = Store.state.auditLog.slice(-200).reverse();
      return {
        head: [t('auditTime'), t('auditActor'), t('auditAction'), t('auditTarget')],
        rows: log.map(a => [
          Cal.formatTimestamp(a.at, I18N.getLang()),
          this.userName(a.actorId), a.action, a.target
        ])
      };
    }
    return { head: [], rows: [] };
  },
  deptName(id) {
    const d = U.byId(Store.state.departments, id);
    return d ? d.name : '—';
  },
  projectName(id) {
    const p = U.byId(Store.state.projects, id);
    return p ? p.title : '—';
  },
  userName(id) {
    const u = U.byId(Store.state.users, id);
    return u ? Users.displayName(u) : '—';
  },
  assigneeNames(task) {
    return (task.assigneeIds || []).map(id => {
      const e = Employees.get(id);
      return e ? e.fullName : null;
    }).filter(Boolean).join('، ') || t('unassigned');
  },
  exportCsv(report) {
    const rows = [report.head, ...report.rows];
    const csv = '\uFEFF' + U.csv(rows);
    U.download('atlas-report.csv', csv, 'text/csv;charset=utf-8');
  }
};
