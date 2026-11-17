/* ===== View: Tasks (list, board, details, progress reporting) ===== */
const TaskViews = {
  filters: { q: '', project: '', employee: '', status: '', priority: '', overdue: false, mine: false, page: 1, mode: 'list' },

  openForm(id, presets) {
    presets = presets || {};
    const task = id ? Tasks.get(id) : null;
    if (id) Perms.assert('tasks', 'edit', task); else Perms.assert('tasks', 'create');
    const cf = Store.state.customFields.filter(f => f.appliesTo === 'task');
    const stages = Workflow.stages('task');
    const body = '<div class="form-grid">' +
      (presets.parentId ? '<input type="hidden" name="parentId" value="' + U.esc(presets.parentId) + '">' : '') +
      '<div class="field span-2"><label>' + t('taskTitle') + ' *</label><input name="title" required value="' + U.esc(task ? task.title : '') + '"></div>' +
      '<div class="field span-2"><label>' + t('description') + '</label><textarea name="description">' + U.esc(task ? task.description : '') + '</textarea></div>' +
      Widgets.selectField('projectId', t('project'), Widgets.projectOptions(), task ? task.projectId : presets.projectId, { empty: t('none') }) +
      Widgets.selectField('priority', t('priority'), Widgets.priorityOptions(), task ? task.priority : 'medium') +
      Widgets.selectField('assigneeIds', t('assignee'), Widgets.employeeOptions(), null, { multiple: true }) +
      Widgets.selectField('reviewerId', t('reviewer'), Widgets.employeeOptions(), task ? task.reviewerId : '', { empty: t('select') }) +
      Widgets.dateField('startDate', t('startDate'), task ? task.startDate : '') +
      Widgets.dateField('dueDate', t('dueDate'), task ? task.dueDate : '') +
      Widgets.selectField('status', t('status'), Widgets.statusOptions('task'), task ? task.status : Store.state.settings.defaultTaskStatus) +
      (stages.length ? Widgets.selectField('stage', t('stage'), stages.map(s => ({ value: s, label: s })), task ? task.stage : '') : '') +
      '<div class="field"><label>' + t('tags') + '</label>' + Widgets.tagsInput('tags', task ? task.tags : []) + '</div>' +
      (cf.map(f => '<div class="field"><label>' + U.esc(I18N.getLang() === 'fa' ? (f.labelFa || f.label) : (f.labelEn || f.label)) + '</label>' +
        (f.type === 'select'
          ? '<select name="cf-' + f.id + '"><option value=""></option>' + (f.options || []).map(o => '<option' + (task && task.custom && task.custom[f.id] === o ? ' selected' : '') + '>' + U.esc(o) + '</option>').join('') + '</select>'
          : '<input name="cf-' + f.id + '" type="' + (f.type === 'number' ? 'number' : f.type === 'date' ? 'text' : 'text') + '" value="' + U.esc(task && task.custom ? task.custom[f.id] || '' : '') + '">') +
        '</div>').join('')) +
      '</div>';
    UI.formModal({
      title: task ? t('editTask') : t('newTask'),
      large: true,
      body,
      onMount(el) {
        Widgets.datepicker('df-startDate');
        Widgets.datepicker('df-dueDate');
        if (task) {
          const sel = el.querySelector('[name="assigneeIds"]');
          (task.assigneeIds || []).forEach(aid => {
            const o = sel.querySelector('option[value="' + aid + '"]');
            if (o) o.selected = true;
          });
        }
      },
      onSubmit(form, close) {
        try {
          const custom = {};
          cf.forEach(f => {
            const v = UI.fv(form, 'cf-' + f.id);
            if (v !== undefined && v !== '') custom[f.id] = v;
          });
          const data = {
            title: UI.fv(form, 'title'),
            description: UI.fv(form, 'description'),
            projectId: UI.fv(form, 'projectId') || null,
            parentId: UI.fv(form, 'parentId') || null,
            priority: UI.fv(form, 'priority'),
            assigneeIds: Array.from(form.querySelector('[name="assigneeIds"]').selectedOptions).map(o => o.value),
            reviewerId: UI.fv(form, 'reviewerId') || null,
            startDate: Widgets.getISO(form, 'startDate'),
            dueDate: Widgets.getISO(form, 'dueDate'),
            status: UI.fv(form, 'status'),
            stage: UI.fv(form, 'stage'),
            tags: Widgets.parseTags(UI.fv(form, 'tags')),
            custom
          };
          if (task) Tasks.update(task.id, data); else Tasks.create(data);
          close();
          UI.toast(t('savedOk'), 'success');
          UI.render();
        } catch (e) { UI.toast(e.message, 'error'); }
        return false;
      }
    });
  },

  openDetails(id) {
    const task = Tasks.get(id);
    const canEdit = Perms.can('tasks', 'edit', task);
    const canAssign = Perms.can('tasks', 'assign', task);
    const subtasks = Tasks.subtasks(task.id);
    const deps = (task.deps || []).map(did => Tasks.raw(did)).filter(Boolean);
    const isDone = Workflow.kindOf('task', task.status) === 'done';
    const stages = Workflow.stages('task');
    const body =
      '<dl class="kv">' +
      '<dt>' + t('status') + '</dt><dd>' + Widgets.statusPill('task', task.status) + '</dd>' +
      '<dt>' + t('priority') + '</dt><dd>' + Widgets.priorityPill(task.priority) + '</dd>' +
      '<dt>' + t('project') + '</dt><dd>' + U.esc(Reports.projectName(task.projectId)) + '</dd>' +
      '<dt>' + t('stage') + '</dt><dd>' + U.esc(task.stage || '—') + '</dd>' +
      '<dt>' + t('assignee') + '</dt><dd>' + U.esc(Reports.assigneeNames(task)) + '</dd>' +
      '<dt>' + t('reviewer') + '</dt><dd>' + U.esc(task.reviewerId ? Employees.displayName(Employees.get(task.reviewerId)) : '—') + '</dd>' +
      '<dt>' + t('startDate') + '</dt><dd>' + (task.startDate ? UI.fmtDate(task.startDate) : '—') + '</dd>' +
      '<dt>' + t('dueDate') + '</dt><dd>' + (task.dueDate ? UI.fmtDate(task.dueDate) : '—') + (Tasks.isOverdue(task) ? ' <span class="pill p-danger">' + t('overdue') + '</span>' : '') + '</dd>' +
      '<dt>' + t('completedAt') + '</dt><dd>' + (task.completedAt ? UI.fmtTS(task.completedAt) : '—') + '</dd>' +
      '<dt>' + t('progress') + '</dt><dd>' + Widgets.progressCell(task.progress) + '</dd>' +
      (deps.length ? '<dt>' + t('dependencies') + '</dt><dd>' + deps.map(d => U.esc(d.title) + (Workflow.kindOf('task', d.status) !== 'done' ? ' ⛔' : '')).join('، ') + '</dd>' : '') +
      ((task.tags || []).length ? '<dt>' + t('tags') + '</dt><dd>' + task.tags.map(x => '<span class="tag">' + U.esc(x) + '</span>').join('') + '</dd>' : '') +
      '</dl>' +
      (task.description ? '<p class="muted">' + U.esc(task.description) + '</p>' : '') +
      (task.resultSummary ? '<div class="card" style="background:var(--surface-2)"><b>' + t('resultSummary') + ':</b> ' + U.esc(task.resultSummary) + '</div>' : '') +
      '<div class="btn-row mt-1">' +
      '<label class="btn btn-sm checkbox-row"><input type="checkbox" id="td-done"' + (isDone ? ' checked' : '') + '> ' + t('checkComplete') + '</label>' +
      (canEdit && !isDone ? '<button class="btn btn-sm" id="td-status">' + t('status') + ': ' + U.esc(Workflow.statusLabel('task', task.status)) + '</button>' : '') +
      (canEdit ? '<button class="btn btn-sm" id="td-edit">' + t('edit') + '</button>' : '') +
      (canAssign ? '<button class="btn btn-sm" id="td-assign">' + t('assignee') + '</button>' : '') +
      '<button class="btn btn-sm btn-primary" id="td-progress">' + t('submitProgress') + '</button>' +
      (Perms.can('tasks', 'delete', task) ? '<button class="btn btn-sm btn-danger" id="td-delete">' + t('delete') + '</button>' : '') +
      '</div>' +
      (subtasks.length ? '<h4 class="mt-2">' + t('subtasks') + ' (' + subtasks.length + ')</h4><ul class="timeline">' +
        subtasks.map(s => '<li><div class="tl-head"><input type="checkbox" data-sub="' + s.id + '"' + (Workflow.kindOf('task', s.status) === 'done' ? ' checked' : '') + '> ' +
          '<a href="#" data-sub-open="' + s.id + '">' + U.esc(s.title) + '</a>' + Widgets.statusPill('task', s.status) + Widgets.progressCell(s.progress) + '</div></li>').join('') + '</ul>' : '') +
      (Perms.can('tasks', 'create') ? '<button class="btn btn-sm mt-1" id="td-add-sub">+ ' + t('subtasks') + '</button>' : '') +
      '<h4 class="mt-2">' + t('updateHistory') + ' (' + (task.updates || []).length + ')</h4>' +
      ((task.updates || []).length ? '<ul class="timeline">' + task.updates.slice().reverse().map(u =>
        '<li><div class="tl-head"><b>' + U.esc(Reports.userName(u.authorId)) + '</b><span class="tl-time">' + UI.fmtTS(u.at) + '</span>' +
        (u.progress != null ? '<span class="pill p-info">' + u.progress + '%</span>' : '') +
        (u.stage ? '<span class="pill">' + U.esc(u.stage) + '</span>' : '') +
        (Perms.can('tasks', 'approve', task) ? '<button class="btn btn-sm btn-ghost" data-del-upd="' + u.id + '">🗑</button>' : '') + '</div>' +
        '<div>' + U.esc(u.description) + '</div>' +
        (u.result ? '<div class="small"><b>' + t('reportedResult') + ':</b> ' + U.esc(u.result) + '</div>' : '') +
        (u.problems ? '<div class="small text-warn"><b>' + t('problems') + ':</b> ' + U.esc(u.problems) + '</div>' : '') +
        (u.nextSteps ? '<div class="small"><b>' + t('nextSteps') + ':</b> ' + U.esc(u.nextSteps) + '</div>' : '') + '</li>').join('') + '</ul>'
        : '<div class="empty-state small">' + t('noData') + '</div>') +
      '<h4 class="mt-2">' + t('comments') + ' (' + (task.comments || []).length + ')</h4>' +
      ((task.comments || []).map(c => '<div class="card mb-1" style="padding:8px 12px"><b class="small">' + U.esc(Reports.userName(c.authorId)) + '</b> <span class="muted small">' + UI.fmtTS(c.at) + '</span><div>' + U.esc(c.text) + '</div></div>').join('') || '') +
      '<div class="flex mt-1"><input type="text" id="td-comment" placeholder="' + t('addComment') + '"><button class="btn btn-sm" id="td-comment-add">' + t('add') + '</button></div>' +
      '<h4 class="mt-2">' + t('attachments') + '</h4>' +
      ((task.attachments || []).map(a => '<div class="flex-between mb-1"><span>📎 ' + U.esc(a.name) + ' <span class="muted small">' + U.fmtBytes(a.size) + '</span></span>' +
        '<button class="btn btn-sm" data-dl-att="' + a.id + '">' + t('export') + '</button></div>').join('') || '') +
      (canEdit ? '<div class="flex mt-1"><input type="text" id="att-name" placeholder="' + t('fileName') + '"><input type="text" id="att-content" placeholder="' + t('fileContent') + '"><button class="btn btn-sm" id="att-add">' + t('attachments_add') + '</button></div>' : '') +
      '<h4 class="mt-2">' + t('history') + '</h4>' +
      ((task.history || []).slice().reverse().map(h => '<div class="small mb-1"><span class="muted">' + UI.fmtTS(h.at) + '</span> — ' + U.esc(Reports.userName(h.actorId)) + ' — ' + U.esc(h.action) + '</div>').join(''));

    const m = UI.modal({
      title: U.esc(task.title),
      large: true,
      body,
      foot: null
    });
    const done = m.el.querySelector('#td-done');
    if (done) done.addEventListener('change', () => {
      try {
        Tasks.setCompleted(task.id, done.checked);
        UI.toast(done.checked ? t('taskCompleted') : t('taskReopened'), 'success');
        m.close();
        UI.render();
      } catch (e) {
        done.checked = !done.checked;
        if (e.code === 'resultRequired') {
          m.close();
          this.openProgressForm(task.id, { requireResult: true });
        } else UI.toast(e.message, 'error');
      }
    });
    const statusBtn = m.el.querySelector('#td-status');
    if (statusBtn) statusBtn.addEventListener('click', () => {
      const allowed = (Workflow.transitions('task')[task.status] || []);
      if (!allowed.length) { UI.toast(t('invalidTransition'), 'warn'); return; }
      UI.formModal({
        title: t('status'),
        body: Widgets.selectField('status', t('status'), allowed.map(s => ({ value: s, label: Workflow.statusLabel('task', s) })), task.status) +
          '<div class="field"><label>' + t('resultSummary') + '</label><textarea name="resultSummary" style="min-height:50px">' + U.esc(task.resultSummary || '') + '</textarea></div>',
        onSubmit(f, close) {
          try {
            task.resultSummary = UI.fv(f, 'resultSummary');
            Tasks.setStatus(task, UI.fv(f, 'status'), {});
            close(); m.close(); UI.render();
            UI.toast(t('savedOk'), 'success');
          } catch (e) { UI.toast(e.message, 'error'); }
          return false;
        }
      });
    });
    const editBtn = m.el.querySelector('#td-edit');
    if (editBtn) editBtn.addEventListener('click', () => { m.close(); TaskViews.openForm(task.id); });
    const assignBtn = m.el.querySelector('#td-assign');
    if (assignBtn) assignBtn.addEventListener('click', () => {
      UI.formModal({
        title: t('assignee'),
        body: '<div class="field"><select name="assigneeIds" multiple size="6">' +
          Widgets.employeeOptions().map(o => '<option value="' + o.value + '"' + ((task.assigneeIds || []).includes(o.value) ? ' selected' : '') + '>' + U.esc(o.label) + '</option>').join('') + '</select></div>',
        onSubmit(f, close) {
          try {
            Tasks.assign(task.id, Array.from(f.querySelector('[name="assigneeIds"]').selectedOptions).map(o => o.value));
            close(); m.close(); UI.render();
            UI.toast(t('savedOk'), 'success');
          } catch (e) { UI.toast(e.message, 'error'); }
          return false;
        }
      });
    });
    const progBtn = m.el.querySelector('#td-progress');
    if (progBtn) progBtn.addEventListener('click', () => { m.close(); TaskViews.openProgressForm(task.id); });
    const delBtn = m.el.querySelector('#td-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      UI.confirm(t('deleteTaskConfirm'), () => {
        Tasks.delete(task.id);
        m.close();
        UI.toast(t('deletedOk'), 'success');
        UI.render();
      });
    });
    const addSub = m.el.querySelector('#td-add-sub');
    if (addSub) addSub.addEventListener('click', () => { m.close(); TaskViews.openForm(null, { parentId: task.id, projectId: task.projectId }); });
    m.el.querySelectorAll('[data-sub]').forEach(cb => cb.addEventListener('change', () => {
      try {
        Tasks.setCompleted(cb.dataset.sub, cb.checked);
        m.close(); UI.render();
      } catch (e) { cb.checked = !cb.checked; UI.toast(e.message, 'error'); }
    }));
    m.el.querySelectorAll('[data-sub-open]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); m.close(); TaskViews.openDetails(a.dataset.subOpen);
    }));
    m.el.querySelectorAll('[data-del-upd]').forEach(b => b.addEventListener('click', () => {
      UI.confirm(t('confirmDelete'), () => {
        try { Tasks.deleteUpdate(task.id, b.dataset.delUpd); m.close(); TaskViews.openDetails(task.id); } catch (e) { UI.toast(e.message, 'error'); }
      });
    }));
    const cmtAdd = m.el.querySelector('#td-comment-add');
    if (cmtAdd) cmtAdd.addEventListener('click', () => {
      try {
        Tasks.addComment(task.id, m.el.querySelector('#td-comment').value);
        m.close(); TaskViews.openDetails(task.id);
      } catch (e) { UI.toast(e.message, 'error'); }
    });
    const attAdd = m.el.querySelector('#att-add');
    if (attAdd) attAdd.addEventListener('click', () => {
      try {
        Tasks.addAttachment(task.id, { name: m.el.querySelector('#att-name').value, content: m.el.querySelector('#att-content').value });
        m.close(); TaskViews.openDetails(task.id);
      } catch (e) { UI.toast(e.message, 'error'); }
    });
    m.el.querySelectorAll('[data-dl-att]').forEach(b => b.addEventListener('click', () => {
      const a = (task.attachments || []).find(x => x.id === b.dataset.dlAtt);
      if (a) U.download(a.name, a.content, 'text/plain;charset=utf-8');
    }));
  },

  openProgressForm(id, opts) {
    opts = opts || {};
    const task = Tasks.get(id);
    const stages = Workflow.stages('task');
    const doneId = Tasks.doneStatusId();
    const allowed = (Workflow.transitions('task')[task.status] || [])
      .filter(s => Workflow.kindOf('task', s) !== 'done');
    const statusOptions = [{ value: '', label: t('none') }].concat(allowed.map(s => ({ value: s, label: Workflow.statusLabel('task', s) })));
    const defaultStatus = '';
    UI.formModal({
      title: t('submitProgress') + ' — ' + U.esc(task.title),
      body:
        '<div class="field"><label>' + t('workDone') + ' *</label><textarea name="description" required></textarea></div>' +
        '<div class="form-grid">' +
        '<div class="field"><label>' + t('newProgress') + '</label><input type="number" name="progress" min="0" max="100" value="' + U.num(task.progress) + '"></div>' +
        (stages.length ? Widgets.selectField('stage', t('stage'), stages.map(s => ({ value: s, label: s })), task.stage || '') : '') +
        (allowed.length ? Widgets.selectField('status', t('status'), statusOptions, defaultStatus) : '') +
        '</div>' +
        '<div class="field"><label>' + t('reportedResult') + '</label><textarea name="result" style="min-height:44px">' + U.esc(task.resultSummary || '') + '</textarea></div>' +
        '<div class="field"><label>' + t('problems') + '</label><textarea name="problems" style="min-height:44px"></textarea></div>' +
        '<div class="field"><label>' + t('nextSteps') + '</label><textarea name="nextSteps" style="min-height:44px"></textarea></div>',
      onSubmit(form, close) {
        try {
          Tasks.addProgressUpdate(task.id, {
            description: UI.fv(form, 'description'),
            progress: UI.fv(form, 'progress'),
            stage: UI.fv(form, 'stage'),
            status: UI.fv(form, 'status') || null,
            result: UI.fv(form, 'result'),
            problems: UI.fv(form, 'problems'),
            nextSteps: UI.fv(form, 'nextSteps')
          });
          if (opts.requireResult) Tasks.setCompleted(task.id, true);
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
  id: 'tasks',
  module: 'tasks',
  title: () => t('tasks'),
  render() {
    TaskViews.filters.page = 1;
    const f = TaskViews.filters;
    const empOpts = Widgets.employeeOptions();
    return '<div class="filter-bar">' +
      '<div class="field wide"><input type="search" id="tk-q" placeholder="' + t('search') + '…"></div>' +
      '<div class="field">' + Widgets.selectField('f-project', '', Widgets.projectOptions(), '', { empty: t('project') }) + '</div>' +
      '<div class="field">' + Widgets.selectField('f-emp', '', empOpts, '', { empty: t('assignee') }) + '</div>' +
      '<div class="field">' + Widgets.selectField('f-status', '', Widgets.statusOptions('task'), '', { empty: t('status') }) + '</div>' +
      '<div class="field">' + Widgets.selectField('f-priority', '', Widgets.priorityOptions(), '', { empty: t('priority') }) + '</div>' +
      '<div class="field checkbox-row"><input type="checkbox" id="tk-overdue"><label for="tk-overdue" style="margin:0">' + t('overdue') + '</label></div>' +
      '<div class="field checkbox-row"><input type="checkbox" id="tk-mine"><label for="tk-mine" style="margin:0">' + t('myTasks') + '</label></div>' +
      (Perms.can('tasks', 'create') ? '<button class="btn btn-primary" id="btn-new-task">+ ' + t('newTask') + '</button>' : '') +
      '</div>' +
      '<div class="btn-row mb-1"><button class="btn btn-sm" id="tk-mode-list">' + t('listView') + '</button><button class="btn btn-sm" id="tk-mode-board">' + t('boardView') + '</button><span id="tk-bulk" class="grow"></span></div>' +
      '<div id="tk-list"></div>';
  },
  bind() {
    const f = TaskViews.filters;
    const rerender = () => this.renderList();
    document.getElementById('tk-q').addEventListener('input', U.debounce(e => { f.q = e.target.value; f.page = 1; rerender(); }, 200));
    document.querySelector('[name="f-project"]').addEventListener('change', e => { f.project = e.target.value; f.page = 1; rerender(); });
    document.querySelector('[name="f-emp"]').addEventListener('change', e => { f.employee = e.target.value; f.page = 1; rerender(); });
    document.querySelector('[name="f-status"]').addEventListener('change', e => { f.status = e.target.value; f.page = 1; rerender(); });
    document.querySelector('[name="f-priority"]').addEventListener('change', e => { f.priority = e.target.value; f.page = 1; rerender(); });
    document.getElementById('tk-overdue').addEventListener('change', e => { f.overdue = e.target.checked; rerender(); });
    document.getElementById('tk-mine').addEventListener('change', e => { f.mine = e.target.checked; rerender(); });
    const btnNew = document.getElementById('btn-new-task');
    if (btnNew) btnNew.addEventListener('click', () => TaskViews.openForm(null));
    document.getElementById('tk-mode-list').addEventListener('click', () => { f.mode = 'list'; rerender(); });
    document.getElementById('tk-mode-board').addEventListener('click', () => { f.mode = 'board'; rerender(); });
    rerender();
  },
  filtered() {
    const f = TaskViews.filters;
    let rows = Tasks.visible().filter(x => !x.parentId);
    if (f.q) rows = rows.filter(x => (x.title + ' ' + (x.description || '')).toLowerCase().includes(f.q.toLowerCase()));
    if (f.project) rows = rows.filter(x => x.projectId === f.project);
    if (f.employee) rows = rows.filter(x => (x.assigneeIds || []).includes(f.employee));
    if (f.status) rows = rows.filter(x => x.status === f.status);
    if (f.priority) rows = rows.filter(x => x.priority === f.priority);
    if (f.overdue) rows = rows.filter(x => Tasks.isOverdue(x));
    if (f.mine) {
      const me = Auth.currentEmployee();
      rows = rows.filter(x => me && (x.assigneeIds || []).includes(me.id));
    }
    return rows;
  },
  renderList() {
    const f = TaskViews.filters;
    const rows = this.filtered();
    const el = document.getElementById('tk-list');
    if (f.mode === 'board') {
      const cols = Workflow.statuses('task').filter(s => s.kind !== 'cancelled');
      el.innerHTML = '<div class="board">' + cols.map(c => {
        const items = rows.filter(x => x.status === c.id);
        return '<div class="board-col"><h4>' + U.esc(Workflow.statusLabel('task', c.id)) + ' (' + items.length + ')</h4>' +
          items.map(x => '<div class="board-card" data-task="' + x.id + '"><b>' + U.esc(x.title) + '</b>' +
            '<div class="small muted">' + U.esc(Reports.projectName(x.projectId)) + '</div>' +
            Widgets.progressCell(x.progress) + '</div>').join('') + '</div>';
      }).join('') + '</div>';
      el.querySelectorAll('[data-task]').forEach(c => c.addEventListener('click', () => TaskViews.openDetails(c.dataset.task)));
      return;
    }
    if (!rows.length) {
      el.innerHTML = '<div class="card empty-state"><div class="icon">✅</div><p>' + t('tasks_empty') + '</p></div>';
      return;
    }
    const perPage = 12;
    const page = U.clamp(f.page, 1, Math.max(1, Math.ceil(rows.length / perPage)));
    const slice = rows.slice((page - 1) * perPage, page * perPage);
    const canDelete = Perms.can('tasks', 'delete');
    const canEdit = Perms.can('tasks', 'edit');
    el.innerHTML = '<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th></th><th>' + t('taskTitle') + '</th><th>' + t('project') + '</th><th>' + t('status') + '</th><th>' + t('stage') + '</th><th>' + t('progress') + '</th><th>' + t('dueDate') + '</th><th>' + t('assignee') + '</th><th></th></tr></thead><tbody>' +
      slice.map(x => '<tr data-task="' + x.id + '" style="cursor:pointer">' +
        '<td><input type="checkbox" data-check="' + x.id + '"' + (Workflow.kindOf('task', x.status) === 'done' ? ' checked' : '') + ' aria-label="' + t('checkComplete') + '"></td>' +
        '<td>' + U.esc(x.title) +
        (Tasks.isBlocked(x) ? ' <span class="pill p-warn" title="' + t('taskBlocked') + '">⛔</span>' : '') +
        (Tasks.isOverdue(x) ? ' <span class="pill p-danger">' + t('overdue') + '</span>' : '') +
        '<div class="muted small">' + (x.tags || []).map(tg => '<span class="tag">' + U.esc(tg) + '</span>').join('') + '</div></td>' +
        '<td>' + U.esc(Reports.projectName(x.projectId)) + '</td>' +
        '<td>' + Widgets.statusPill('task', x.status) + '</td>' +
        '<td>' + U.esc(x.stage || '—') + '</td>' +
        '<td>' + Widgets.progressCell(x.progress) + '</td>' +
        '<td class="nowrap">' + (x.dueDate ? UI.fmtDate(x.dueDate) : '—') + '</td>' +
        '<td>' + U.esc(Reports.assigneeNames(x)) + '</td>' +
        '<td class="row-actions"><button class="btn btn-sm btn-ghost" data-report="' + x.id + '">' + t('progressReport') + '</button>' +
        (canDelete ? '<button class="btn btn-sm btn-ghost" data-del="' + x.id + '">🗑</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' + Widgets.pagination(rows.length, page, perPage, p => { f.page = p; this.renderList(); }) + '</div>';
    el.querySelectorAll('tr[data-task]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('input,button')) return;
      TaskViews.openDetails(tr.dataset.task);
    }));
    el.querySelectorAll('[data-check]').forEach(cb => cb.addEventListener('change', () => {
      try {
        Tasks.setCompleted(cb.dataset.check, cb.checked);
        UI.toast(cb.checked ? t('taskCompleted') : t('taskReopened'), 'success');
        this.renderList();
      } catch (e) {
        cb.checked = !cb.checked;
        if (e.code === 'resultRequired') TaskViews.openProgressForm(cb.dataset.check, { requireResult: true });
        else UI.toast(e.message, 'error');
      }
    }));
    el.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      TaskViews.openProgressForm(b.dataset.report);
    }));
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      UI.confirm(t('deleteTaskConfirm'), () => {
        Tasks.delete(b.dataset.del);
        UI.toast(t('deletedOk'), 'success');
        this.renderList();
      });
    }));
  }
});

UI.registerView({
  id: 'myTasks',
  module: 'tasks',
  title: () => t('myTasks'),
  render() {
    const me = Auth.currentEmployee();
    const rows = me ? Tasks.visible().filter(x => (x.assigneeIds || []).includes(me.id) && Workflow.kindOf('task', x.status) !== 'done') : [];
    if (!me) return '<div class="card empty-state"><p>' + t('unassigned') + '</p></div>';
    return '<div class="card"><h3>' + t('myTasks') + ' (' + rows.length + ')</h3>' +
      (rows.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>' + t('taskTitle') + '</th><th>' + t('dueDate') + '</th><th>' + t('progress') + '</th><th>' + t('status') + '</th><th></th></tr></thead><tbody>' +
        rows.map(x => '<tr data-task="' + x.id + '" style="cursor:pointer">' +
          '<td><input type="checkbox" data-check="' + x.id + '"' + (Workflow.kindOf('task', x.status) === 'done' ? ' checked' : '') + '></td>' +
          '<td>' + U.esc(x.title) + (Tasks.isOverdue(x) ? ' <span class="pill p-danger">' + t('overdue') + '</span>' : '') + '</td>' +
          '<td class="nowrap">' + (x.dueDate ? UI.fmtDate(x.dueDate) : '—') + '</td>' +
          '<td>' + Widgets.progressCell(x.progress) + '</td>' +
          '<td>' + Widgets.statusPill('task', x.status) + '</td>' +
          '<td><button class="btn btn-sm" data-report="' + x.id + '">' + t('submitProgress') + '</button></td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty-state">' + t('noData') + '</div>') + '</div>';
  },
  bind() {
    document.querySelectorAll('tr[data-task]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('input,button')) return;
      TaskViews.openDetails(tr.dataset.task);
    }));
    document.querySelectorAll('[data-check]').forEach(cb => cb.addEventListener('change', () => {
      try {
        Tasks.setCompleted(cb.dataset.check, cb.checked);
        UI.toast(cb.checked ? t('taskCompleted') : t('taskReopened'), 'success');
        UI.render();
      } catch (e) {
        cb.checked = !cb.checked;
        if (e.code === 'resultRequired') TaskViews.openProgressForm(cb.dataset.check, { requireResult: true });
        else UI.toast(e.message, 'error');
      }
    }));
    document.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      TaskViews.openProgressForm(b.dataset.report);
    }));
  }
});
