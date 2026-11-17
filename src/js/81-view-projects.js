/* ===== View: Projects list & detail ===== */
UI.registerView({
  id: 'projects',
  module: 'projects',
  title: () => t('projects'),
  render(params) {
    this.state = { q: '', status: '', dept: '', archived: false, page: 1 };
    const canCreate = Perms.can('projects', 'create');
    let html = '<div class="filter-bar">' +
      '<div class="field wide"><input type="search" id="prj-q" placeholder="' + t('search') + '…"></div>' +
      '<div class="field">' + Widgets.selectField('f-status', '', Widgets.statusOptions('project'), '', { empty: t('status') }) + '</div>' +
      '<div class="field">' + Widgets.selectField('f-dept', '', Widgets.deptOptions(), '', { empty: t('department') }) + '</div>' +
      (Perms.can('projects', 'archive') ? '<div class="field checkbox-row"><input type="checkbox" id="prj-arch"><label for="prj-arch" style="margin:0">' + t('archived') + '</label></div>' : '') +
      (canCreate ? '<button class="btn btn-primary" id="btn-new-project">+ ' + t('newProject') + '</button>' : '') +
      '</div><div id="prj-list"></div>';
    return html;
  },
  bind() {
    const rerender = () => this.renderList();
    document.getElementById('prj-q').addEventListener('input', U.debounce(e => { this.state.q = e.target.value; this.state.page = 1; rerender(); }, 200));
    document.querySelector('[name="f-status"]').addEventListener('change', e => { this.state.status = e.target.value; rerender(); });
    document.querySelector('[name="f-dept"]').addEventListener('change', e => { this.state.dept = e.target.value; rerender(); });
    const arch = document.getElementById('prj-arch');
    if (arch) arch.addEventListener('change', e => { this.state.archived = e.target.checked; rerender(); });
    const btnNew = document.getElementById('btn-new-project');
    if (btnNew) btnNew.addEventListener('click', () => ProjectViews.openForm(null));
    rerender();
  },
  renderList() {
    const st = this.state;
    let rows = st.archived ? Projects.archivedList() : Projects.visible();
    if (st.q) rows = rows.filter(p => p.title.toLowerCase().includes(st.q.toLowerCase()));
    if (st.status) rows = rows.filter(p => p.status === st.status);
    if (st.dept) rows = rows.filter(p => p.departmentId === st.dept);
    const perPage = 10;
    const page = U.clamp(st.page, 1, Math.max(1, Math.ceil(rows.length / perPage)));
    const slice = rows.slice((page - 1) * perPage, page * perPage);
    const canEdit = Perms.can('projects', 'edit');
    const el = document.getElementById('prj-list');
    if (!rows.length) {
      el.innerHTML = '<div class="card empty-state"><div class="icon">📁</div><p>' + t('projects_empty') + '</p></div>';
      return;
    }
    el.innerHTML = '<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>' + t('projectTitle') + '</th><th>' + t('status') + '</th><th>' + t('priority') + '</th><th>' + t('progress') + '</th><th>' + t('manager') + '</th><th>' + t('endDate') + '</th><th></th></tr></thead><tbody>' +
      slice.map(p => {
        const mgr = p.managerEmployeeId ? Employees.get(p.managerEmployeeId) : null;
        return '<tr data-id="' + p.id + '" style="cursor:pointer">' +
          '<td><a href="#" data-open="' + p.id + '">' + U.esc(p.title) + '</a>' + (p.archived ? ' <span class="pill p-muted">' + t('archived') + '</span>' : '') +
          '<div class="muted small">' + (p.tags || []).map(x => '<span class="tag">' + U.esc(x) + '</span>').join('') + '</div></td>' +
          '<td>' + Widgets.statusPill('project', p.status) + '</td>' +
          '<td>' + Widgets.priorityPill(p.priority) + '</td>' +
          '<td>' + Widgets.progressCell(Projects.progress(p)) + '</td>' +
          '<td>' + U.esc(mgr ? mgr.fullName : t('unassigned')) + '</td>' +
          '<td class="nowrap">' + (p.endDate ? UI.fmtDate(p.endDate) : '—') + (Projects.isDelayed(p) ? ' <span class="pill p-danger">' + t('overdue') + '</span>' : '') + '</td>' +
          '<td class="row-actions">' +
          '<button class="btn btn-sm btn-ghost" data-open="' + p.id + '">' + t('view') + '</button>' +
          (canEdit && !p.archived ? '<button class="btn btn-sm btn-ghost" data-edit="' + p.id + '">' + t('edit') + '</button>' : '') +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>' + Widgets.pagination(rows.length, page, perPage, p => { st.page = p; this.renderList(); }) + '</div>';
    el.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); UI.nav('projectDetail', { id: a.dataset.open });
    }));
    el.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('a,button')) return;
      UI.nav('projectDetail', { id: tr.dataset.id });
    }));
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      ProjectViews.openForm(b.dataset.edit);
    }));
  }
});

const ProjectViews = {
  openForm(id) {
    const p = id ? Projects.get(id) : null;
    if (id) Perms.assert('projects', 'edit', p); else Perms.assert('projects', 'create');
    const canWf = Perms.can('workflow', 'view');
    const body =
      '<div class="form-grid">' +
      '<div class="field span-2"><label>' + t('projectTitle') + ' *</label><input name="title" required value="' + U.esc(p ? p.title : '') + '"></div>' +
      '<div class="field span-2"><label>' + t('description') + '</label><textarea name="description">' + U.esc(p ? p.description : '') + '</textarea></div>' +
      '<div class="field span-2"><label>' + t('objectives') + '</label><textarea name="objectives" style="min-height:50px">' + U.esc(p ? p.objectives : '') + '</textarea></div>' +
      Widgets.selectField('managerEmployeeId', t('manager'), Widgets.employeeOptions(), p ? p.managerEmployeeId : '', { empty: t('select') }) +
      Widgets.selectField('departmentId', t('department'), Widgets.deptOptions(), p ? p.departmentId : '', { empty: t('select') }) +
      Widgets.selectField('teamId', t('team'), Widgets.teamOptions(), p ? p.teamId : '', { empty: t('select') }) +
      Widgets.selectField('priority', t('priority'), Widgets.priorityOptions(), p ? p.priority : 'medium') +
      Widgets.dateField('startDate', t('startDate'), p ? p.startDate : '') +
      Widgets.dateField('endDate', t('endDate'), p ? p.endDate : '') +
      Widgets.dateField('targetDate', t('targetDate'), p ? p.targetDate : '') +
      Widgets.selectField('status', t('status'), Widgets.statusOptions('project'), p ? p.status : Store.state.settings.defaultProjectStatus) +
      '<div class="field"><label>' + t('members') + '</label><select name="memberIds" multiple size="5">' +
      Widgets.employeeOptions().map(o => '<option value="' + o.value + '"' + (p && (p.memberIds || []).includes(o.value) ? ' selected' : '') + '>' + U.esc(o.label) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>' + t('tags') + '</label>' + Widgets.tagsInput('tags', p ? p.tags : []) + '</div>' +
      '</div>';
    UI.formModal({
      title: p ? t('editProject') : t('newProject'),
      large: true,
      body,
      onMount(el) {
        Widgets.datepicker('df-startDate');
        Widgets.datepicker('df-endDate');
        Widgets.datepicker('df-targetDate');
      },
      onSubmit(form, close) {
        try {
          const data = {
            title: UI.fv(form, 'title'),
            description: UI.fv(form, 'description'),
            objectives: UI.fv(form, 'objectives'),
            managerEmployeeId: UI.fv(form, 'managerEmployeeId') || null,
            departmentId: UI.fv(form, 'departmentId') || null,
            teamId: UI.fv(form, 'teamId') || null,
            priority: UI.fv(form, 'priority'),
            status: UI.fv(form, 'status'),
            startDate: Widgets.getISO(form, 'startDate'),
            endDate: Widgets.getISO(form, 'endDate'),
            targetDate: Widgets.getISO(form, 'targetDate'),
            memberIds: Array.from(form.querySelector('[name="memberIds"]').selectedOptions).map(o => o.value),
            tags: Widgets.parseTags(UI.fv(form, 'tags'))
          };
          if (p) Projects.update(p.id, data); else Projects.create(data);
          close();
          UI.toast(t('savedOk'), 'success');
          UI.render();
        } catch (e) { UI.toast(e.message, 'error'); }
        return false;
      }
    });
  }
};

UI.registerView({
  id: 'projectDetail',
  module: 'projects',
  title: () => t('project'),
  fluid: false,
  render(params) {
    const p = Projects.get(params.id);
    const canEdit = Perms.can('projects', 'edit', p);
    const tasks = Perms.visible('tasks', Store.state.tasks.filter(x => x.projectId === p.id && !x.archived && !x.parentId));
    const ms = Projects.projectMilestones(p.id);
    const progress = Projects.progress(p);
    const html = '<div class="breadcrumb"><a href="#projects" id="bc-back">' + t('projects') + '</a> / ' + U.esc(p.title) + '</div>' +
      '<div class="flex-between mb-2"><h1 class="mb-0">' + U.esc(p.title) + '</h1><div class="btn-row">' +
      (canEdit ? '<button class="btn" id="pd-edit">' + t('edit') + '</button>' : '') +
      (canEdit && !p.archived ? '<button class="btn" id="pd-archive">' + t('archive') + '</button>' : '') +
      (Perms.can('projects', 'restore', p) && p.archived ? '<button class="btn" id="pd-unarchive">' + t('unarchive') + '</button>' : '') +
      (Perms.can('projects', 'delete', p) ? '<button class="btn btn-danger" id="pd-delete">' + t('delete') + '</button>' : '') +
      '</div></div>' +
      '<div class="grid grid-2">' +
      '<div class="card"><h3>' + t('overview') + '</h3><dl class="kv">' +
      '<dt>' + t('status') + '</dt><dd>' + Widgets.statusPill('project', p.status) + '</dd>' +
      '<dt>' + t('priority') + '</dt><dd>' + Widgets.priorityPill(p.priority) + '</dd>' +
      '<dt>' + t('manager') + '</dt><dd>' + U.esc(p.managerEmployeeId ? Employees.displayName(Employees.get(p.managerEmployeeId)) : t('unassigned')) + '</dd>' +
      '<dt>' + t('members') + '</dt><dd>' + ((p.memberIds || []).map(id => { const e = Employees.get(id); return e ? U.esc(e.fullName) : null; }).filter(Boolean).join('، ') || t('unassigned')) + '</dd>' +
      '<dt>' + t('startDate') + '</dt><dd>' + (p.startDate ? UI.fmtDate(p.startDate) : '—') + '</dd>' +
      '<dt>' + t('endDate') + '</dt><dd>' + (p.endDate ? UI.fmtDate(p.endDate) : '—') + (Projects.isDelayed(p) ? ' <span class="pill p-danger">' + t('overdue') + '</span>' : '') + '</dd>' +
      '<dt>' + t('progress') + '</dt><dd>' + Widgets.progressCell(progress) + '</dd>' +
      '<dt>' + t('department') + '</dt><dd>' + U.esc(Reports.deptName(p.departmentId)) + '</dd>' +
      '<dt>' + t('tags') + '</dt><dd>' + (p.tags || []).map(x => '<span class="tag">' + U.esc(x) + '</span>').join('') + '</dd>' +
      '</dl>' + (p.description ? '<p class="mt-2 mb-0">' + U.esc(p.description) + '</p>' : '') +
      (p.objectives ? '<p class="muted small mb-0">' + U.esc(t('objectives')) + ': ' + U.esc(p.objectives) + '</p>' : '') + '</div>' +
      '<div class="card"><h3>' + t('milestones') + '</h3>' +
      (Perms.can('projects', 'edit', p) ? '<button class="btn btn-sm mb-1" id="pd-add-ms">+ ' + t('newMilestone') + '</button>' : '') +
      (ms.length ? '<ul class="timeline">' + ms.map(m => '<li><div class="tl-head">' +
        '<input type="checkbox" data-ms="' + m.id + '"' + (m.done ? ' checked' : '') + ' style="accent-color:var(--accent)"> ' +
        '<span' + (m.done ? ' style="text-decoration:line-through;opacity:.6"' : '') + '>' + U.esc(m.title) + '</span>' +
        (m.dueDate ? '<span class="pill p-info">' + UI.fmtDate(m.dueDate) + '</span>' : '') + '</div></li>').join('') + '</ul>'
        : '<div class="empty-state small">' + t('noData') + '</div>') + '</div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><h3>' + t('relatedTasks') + ' (' + tasks.length + ')</h3>' +
      (Perms.can('tasks', 'create') ? '<button class="btn btn-sm btn-primary" id="pd-add-task">+ ' + t('newTask') + '</button>' : '') + '</div>' +
      (tasks.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>' + t('taskTitle') + '</th><th>' + t('status') + '</th><th>' + t('progress') + '</th><th>' + t('dueDate') + '</th><th>' + t('assignee') + '</th></tr></thead><tbody>' +
        tasks.map(x => '<tr style="cursor:pointer" data-task="' + x.id + '"><td><input type="checkbox" data-check="' + x.id + '"' + (Workflow.kindOf('task', x.status) === 'done' ? ' checked' : '') + '></td>' +
          '<td>' + U.esc(x.title) + (Tasks.isBlocked(x) ? ' <span class="pill p-warn">⛔</span>' : '') + '</td>' +
          '<td>' + Widgets.statusPill('task', x.status) + '</td>' +
          '<td>' + Widgets.progressCell(x.progress) + '</td>' +
          '<td class="nowrap">' + (x.dueDate ? UI.fmtDate(x.dueDate) : '—') + (Tasks.isOverdue(x) ? ' <span class="pill p-danger">' + t('overdue') + '</span>' : '') + '</td>' +
          '<td>' + U.esc(Reports.assigneeNames(x)) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty-state small">' + t('noData') + '</div>') + '</div>' +
      '<div class="card"><h3>' + t('activityHistory') + '</h3>' + this.historyHtml(p) + '</div>';
    return html;
  },
  historyHtml(p) {
    const acts = Store.state.auditLog.filter(a => a.target === 'project:' + p.id).slice(-15).reverse();
    if (!acts.length) return '<div class="empty-state small">' + t('noData') + '</div>';
    return '<ul class="timeline">' + acts.map(a => '<li><div class="tl-head"><span>' + U.esc(Reports.userName(a.actorId)) + '</span>' +
      '<span class="muted small">' + U.esc(a.action) + '</span><span class="tl-time">' + UI.fmtTS(a.at) + '</span></div></li>').join('') + '</ul>';
  },
  bind(params) {
    const p = Projects.get(params.id);
    const back = document.getElementById('bc-back');
    if (back) back.addEventListener('click', e => { e.preventDefault(); UI.nav('projects'); });
    const edit = document.getElementById('pd-edit');
    if (edit) edit.addEventListener('click', () => ProjectViews.openForm(p.id));
    const arch = document.getElementById('pd-archive');
    if (arch) arch.addEventListener('click', () => { Projects.setArchived(p.id, true); UI.toast(t('savedOk'), 'success'); UI.nav('projects'); });
    const unarch = document.getElementById('pd-unarchive');
    if (unarch) unarch.addEventListener('click', () => { Projects.setArchived(p.id, false); UI.toast(t('savedOk'), 'success'); UI.render(); });
    const del = document.getElementById('pd-delete');
    if (del) del.addEventListener('click', () => {
      const n = Store.state.tasks.filter(x => x.projectId === p.id).length;
      UI.confirm(t('deleteProjectConfirm', { n }), () => {
        Projects.delete(p.id);
        UI.toast(t('deletedOk'), 'success');
        UI.nav('projects');
      });
    });
    const addMs = document.getElementById('pd-add-ms');
    if (addMs) addMs.addEventListener('click', () => {
      UI.formModal({
        title: t('newMilestone'),
        body: '<div class="field"><label>' + t('title') + ' *</label><input name="title" required></div>' + Widgets.dateField('dueDate', t('dueDate'), ''),
        onMount(el) { Widgets.datepicker('df-dueDate'); },
        onSubmit(form, close) {
          try {
            Projects.addMilestone(p.id, { title: UI.fv(form, 'title'), dueDate: Widgets.getISO(form, 'dueDate') });
            close(); UI.render();
          } catch (e) { UI.toast(e.message, 'error'); }
          return false;
        }
      });
    });
    document.querySelectorAll('[data-ms]').forEach(cb => cb.addEventListener('change', () => {
      try { Projects.toggleMilestone(cb.dataset.ms); UI.render(); } catch (e) { UI.toast(e.message, 'error'); }
    }));
    const addTask = document.getElementById('pd-add-task');
    if (addTask) addTask.addEventListener('click', () => TaskViews.openForm(null, { projectId: p.id }));
    document.querySelectorAll('[data-task]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('input')) return;
      TaskViews.openDetails(tr.dataset.task);
    }));
    document.querySelectorAll('[data-check]').forEach(cb => cb.addEventListener('change', () => {
      try {
        Tasks.setCompleted(cb.dataset.check, cb.checked);
        UI.toast(cb.checked ? t('taskCompleted') : t('taskReopened'), 'success');
        UI.render();
      } catch (e) {
        cb.checked = !cb.checked;
        UI.toast(e.message, 'error');
      }
    }));
  }
});
