/* ===== View: Dashboard ===== */
UI.registerView({
  id: 'dashboard',
  module: 'dashboard',
  title: () => t('dashboard'),
  render() {
    const s = Store.state;
    const lang = I18N.getLang();
    const projects = Projects.visible();
    const tasks = Perms.visible('tasks', s.tasks.filter(x => !x.archived && !x.parentId));
    const today = Cal.todayISO();
    const kindOf = k => Workflow.kindOf('project', k);
    const stats = {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => kindOf(p.status) === 'active' || kindOf(p.status) === 'open').length,
      completedProjects: projects.filter(p => kindOf(p.status) === 'done').length,
      delayedProjects: projects.filter(p => Projects.isDelayed(p)).length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(x => Workflow.kindOf('task', x.status) === 'done').length,
      inProgressTasks: tasks.filter(x => Workflow.kindOf('task', x.status) === 'active').length,
      overdueTasks: tasks.filter(x => Tasks.isOverdue(x)).length
    };
    const widgets = s.settings.dashboardWidgets || {};
    let html = '<div class="flex-between mb-2"><h1 class="mb-0">' + U.esc(t('dash_welcomeUser', { name: Users.displayName(Auth.currentUser()) })) + '</h1>' +
      (Perms.can('settings', 'edit') ? '<button class="btn btn-sm" id="btn-dash-cfg">⚙ ' + t('dash_customize') + '</button>' : '') + '</div>';

    if (widgets.stats) {
      html += '<div class="grid grid-4 mb-2">' +
        this.stat(t('dash_totalProjects'), stats.totalProjects, '') +
        this.stat(t('dash_activeProjects'), stats.activeProjects, '') +
        this.stat(t('dash_completedProjects'), stats.completedProjects, 'ok') +
        this.stat(t('dash_delayedProjects'), stats.delayedProjects, 'danger') +
        this.stat(t('dash_totalTasks'), stats.totalTasks, '') +
        this.stat(t('dash_completedTasks'), stats.completedTasks, 'ok') +
        this.stat(t('dash_inProgressTasks'), stats.inProgressTasks, '') +
        this.stat(t('dash_overdueTasks'), stats.overdueTasks, 'danger') +
        '</div>';
    }
    html += '<div class="grid grid-2">';
    if (widgets.charts) {
      html += '<div class="card"><h3>' + t('dash_projectStatus') + '</h3>' +
        Charts.donut(Workflow.statuses('project').map(st => ({
          label: Workflow.statusLabel('project', st.id), value: projects.filter(p => p.status === st.id).length, color: st.color
        }))) + '</div>';
      html += '<div class="card"><h3>' + t('dash_taskStatus') + '</h3>' +
        Charts.donut(Workflow.statuses('task').map(st => ({
          label: Workflow.statusLabel('task', st.id), value: tasks.filter(x => x.status === st.id).length, color: st.color
        }))) + '</div>';
    }
    if (widgets.deadlines) {
      const upcoming = tasks.filter(x => x.dueDate && Workflow.kindOf('task', x.status) === 'active' && Cal.diffDays(x.dueDate, today) >= 0 && Cal.diffDays(x.dueDate, today) <= 14)
        .sort((a, b) => U.cmp(a.dueDate, b.dueDate)).slice(0, 8);
      html += '<div class="card"><h3>' + t('dash_upcomingDeadlines') + '</h3>' +
        (upcoming.length ? '<ul class="timeline">' + upcoming.map(x => '<li><div class="tl-head"><a href="#" data-task="' + x.id + '">' + U.esc(x.title) + '</a>' +
          '<span class="pill ' + (Cal.diffDays(x.dueDate, today) <= 2 ? 'p-danger' : 'p-warn') + '">' + this.fmt(x.dueDate) + '</span></div></li>').join('') + '</ul>'
          : '<div class="empty-state small">' + t('noData') + '</div>') + '</div>';
    }
    if (widgets.milestones) {
      const ms = [];
      projects.forEach(p => Projects.projectMilestones(p.id).forEach(m => { if (!m.done) ms.push({ p, m }); }));
      ms.sort((a, b) => U.cmp(a.m.dueDate || '9999', b.m.dueDate || '9999'));
      html += '<div class="card"><h3>' + t('dash_upcomingMilestones') + '</h3>' +
        (ms.length ? '<ul class="timeline">' + ms.slice(0, 8).map(r => '<li><div class="tl-head"><a href="#" data-project="' + r.p.id + '">' + U.esc(r.m.title) + '</a>' +
          '<span class="muted small">' + U.esc(r.p.title) + '</span>' +
          (r.m.dueDate ? '<span class="pill p-info">' + this.fmt(r.m.dueDate) + '</span>' : '') + '</div></li>').join('') + '</ul>'
          : '<div class="empty-state small">' + t('noData') + '</div>') + '</div>';
    }
    if (widgets.workload) {
      const emps = Employees.active().filter(e => Perms.can('employees', 'view', e));
      const wl = emps.map(e => ({ label: e.fullName, value: Employees.workload(e.id) })).filter(x => x.value > 0)
        .sort((a, b) => b.value - a.value).slice(0, 8);
      html += '<div class="card"><h3>' + t('dash_employeeWorkload') + '</h3>' +
        (wl.length ? Charts.bars(wl) : '<div class="empty-state small">' + t('noData') + '</div>') + '</div>';
    }
    if (widgets.activity) {
      const acts = Store.state.auditLog.slice(-10).reverse();
      html += '<div class="card"><h3>' + t('dash_recentActivity') + '</h3>' +
        (acts.length ? '<ul class="timeline">' + acts.map(a => '<li><div class="tl-head"><span>' + U.esc(Reports.userName(a.actorId)) + '</span>' +
          '<span class="muted small">' + U.esc(a.action) + '</span><span class="tl-time">' + this.fmtTS(a.at) + '</span></div></li>').join('') + '</ul>'
          : '<div class="empty-state small">' + t('noData') + '</div>') + '</div>';
    }
    html += '</div>';
    html += '<div class="card"><h3>' + t('dash_taskTrend') + '</h3>' + this.trendChart(tasks) + '</div>';
    return html;
  },
  stat(label, value, cls) {
    return '<div class="stat-card ' + cls + '"><div class="stat-value seq-num">' + value + '</div><div class="stat-label">' + U.esc(label) + '</div></div>';
  },
  fmt(iso) { return Cal.formatISO(iso, I18N.getLang()); },
  fmtTS(ts) { return Cal.formatTimestamp(ts, I18N.getLang(), false); },
  trendChart(tasks) {
    const done = tasks.filter(x => x.completedAt);
    const weeks = [];
    const today = Cal.todayISO();
    for (let i = 7; i >= 0; i--) {
      const end = Cal.addDays(today, -i * 7);
      const start = Cal.addDays(end, -6);
      weeks.push({ label: Cal.formatISO(start, I18N.getLang(), { medium: true }), value: done.filter(x => x.completedAt >= start + 'T00:00' && x.completedAt <= end + 'T23:59').length });
    }
    return Charts.line(weeks);
  },
  bind() {
    document.querySelectorAll('[data-task]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); TaskViews.openDetails(a.dataset.task);
    }));
    document.querySelectorAll('[data-project]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); UI.nav('projectDetail', { id: a.dataset.project });
    }));
    const cfg = document.getElementById('btn-dash-cfg');
    if (cfg) cfg.addEventListener('click', () => this.configure());
  },
  configure() {
    const w = Store.state.settings.dashboardWidgets;
    const defs = [['stats', 'stats'], ['charts', 'charts'], ['deadlines', 'dash_upcomingDeadlines'], ['milestones', 'dash_upcomingMilestones'], ['workload', 'dash_employeeWorkload'], ['activity', 'dash_recentActivity']];
    UI.formModal({
      title: t('dash_customize'),
      body: defs.map(([id, key]) => '<div class="field checkbox-row"><input type="checkbox" name="' + id + '" id="w-' + id + '"' + (w[id] ? ' checked' : '') + '><label for="w-' + id + '" style="margin:0">' + U.esc(t(key === 'stats' ? 'stats' : key)) + '</label></div>').join(''),
      onSubmit: (form, close) => {
        defs.forEach(([id]) => { w[id] = UI.fv(form, id); });
        Store.markDirty();
        close();
        UI.render();
      }
    });
  }
});
