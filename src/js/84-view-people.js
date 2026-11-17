/* ===== Views: Employees & Org chart ===== */
UI.registerView({
  id: 'employees',
  module: 'employees',
  title: () => t('employees'),
  render() {
    this.st = { q: '', dept: '', status: 'active', page: 1 };
    return '<div class="filter-bar">' +
      '<div class="field wide"><input type="search" id="emp-q" placeholder="' + t('search') + '…"></div>' +
      '<div class="field">' + Widgets.selectField('f-dept', '', Widgets.deptOptions(), '', { empty: t('department') }) + '</div>' +
      '<div class="field">' + Widgets.selectField('f-st', '', [
        { value: 'active', label: t('empActive') }, { value: 'inactive', label: t('empInactive') }, { value: 'archived', label: t('empArchived') }
      ], 'active', {}) + '</div>' +
      (Perms.can('employees', 'create') ? '<button class="btn btn-primary" id="btn-new-emp">+ ' + t('newEmployee') + '</button>' : '') +
      '</div><div id="emp-list"></div>';
  },
  bind() {
    const rerender = () => this.renderList();
    document.getElementById('emp-q').addEventListener('input', U.debounce(e => { this.st.q = e.target.value; this.st.page = 1; rerender(); }, 200));
    document.querySelector('[name="f-dept"]').addEventListener('change', e => { this.st.dept = e.target.value; rerender(); });
    document.querySelector('[name="f-st"]').addEventListener('change', e => { this.st.status = e.target.value; rerender(); });
    const btn = document.getElementById('btn-new-emp');
    if (btn) btn.addEventListener('click', () => EmployeeViews.openForm(null));
    rerender();
  },
  renderList() {
    const st = this.st;
    let rows = Perms.visible('employees', Store.state.employees).filter(e => e.status === st.status);
    if (st.q) rows = rows.filter(e => (e.fullName + ' ' + e.empNo + ' ' + (e.jobTitle || '')).toLowerCase().includes(st.q.toLowerCase()));
    if (st.dept) rows = rows.filter(e => e.departmentId === st.dept);
    const perPage = 10;
    const page = U.clamp(st.page, 1, Math.max(1, Math.ceil(rows.length / perPage)));
    const slice = rows.slice((page - 1) * perPage, page * perPage);
    const el = document.getElementById('emp-list');
    if (!rows.length) { el.innerHTML = '<div class="card empty-state"><div class="icon">👥</div><p>' + t('employees_empty') + '</p></div>'; return; }
    el.innerHTML = '<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>' + t('employee') + '</th><th>' + t('employeeNo') + '</th><th>' + t('jobTitle') + '</th><th>' + t('department') + '</th><th>' + t('team') + '</th><th>' + t('workload') + '</th><th></th></tr></thead><tbody>' +
      slice.map(e => '<tr>' +
        '<td>' + Widgets.userCell(e.fullName, e.email || '') + '</td>' +
        '<td class="mono">' + U.esc(e.empNo) + '</td>' +
        '<td>' + U.esc(e.jobTitle || '—') + '</td>' +
        '<td>' + U.esc(Reports.deptName(e.departmentId)) + '</td>' +
        '<td>' + U.esc((U.byId(Store.state.teams, e.teamId) || {}).name || '—') + '</td>' +
        '<td><span class="pill ' + (Employees.workload(e.id) > 5 ? 'p-danger' : 'p-muted') + ' seq-num">' + Employees.workload(e.id) + '</span></td>' +
        '<td class="row-actions"><button class="btn btn-sm btn-ghost" data-view="' + e.id + '">' + t('view') + '</button>' +
        (Perms.can('employees', 'edit', e) ? '<button class="btn btn-sm btn-ghost" data-edit="' + e.id + '">' + t('edit') + '</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' + Widgets.pagination(rows.length, page, perPage, p => { st.page = p; this.renderList(); }) + '</div>';
    el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => EmployeeViews.openDetails(b.dataset.view)));
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => EmployeeViews.openForm(b.dataset.edit)));
  }
});

const EmployeeViews = {
  openForm(id) {
    const emp = id ? U.byId(Store.state.employees, id) : null;
    if (id) Perms.assert('employees', 'edit', emp); else Perms.assert('employees', 'create');
    UI.formModal({
      title: emp ? t('editEmployee') : t('newEmployee'),
      large: true,
      body: '<div class="form-grid">' +
        '<div class="field"><label>' + t('fullName') + ' *</label><input name="fullName" required value="' + U.esc(emp ? emp.fullName : '') + '"></div>' +
        '<div class="field"><label>' + t('employeeNo') + ' *</label><input name="empNo" required value="' + U.esc(emp ? emp.empNo : '') + '"></div>' +
        '<div class="field"><label>' + t('jobTitle') + '</label><input name="jobTitle" value="' + U.esc(emp ? emp.jobTitle : '') + '"></div>' +
        Widgets.selectField('departmentId', t('department'), Widgets.deptOptions(), emp ? emp.departmentId : '', { empty: t('select') }) +
        Widgets.selectField('teamId', t('team'), Widgets.teamOptions(), emp ? emp.teamId : '', { empty: t('select') }) +
        Widgets.selectField('managerId', t('manager'), Widgets.employeeOptions().filter(o => !emp || o.value !== emp.id), emp ? emp.managerId : '', { empty: t('select') }) +
        Widgets.selectField('status', t('employmentStatus'), [
          { value: 'active', label: t('empActive') }, { value: 'inactive', label: t('empInactive') }, { value: 'archived', label: t('empArchived') }
        ], emp ? emp.status : 'active') +
        '<div class="field"><label>' + t('email') + '</label><input name="email" type="email" value="' + U.esc(emp ? emp.email : '') + '"></div>' +
        '<div class="field"><label>' + t('phone') + '</label><input name="phone" value="' + U.esc(emp ? emp.phone : '') + '"></div>' +
        '</div>',
      onSubmit(form, close) {
        try {
          const data = {
            fullName: UI.fv(form, 'fullName'), empNo: UI.fv(form, 'empNo'),
            jobTitle: UI.fv(form, 'jobTitle'),
            departmentId: UI.fv(form, 'departmentId') || null,
            teamId: UI.fv(form, 'teamId') || null,
            managerId: UI.fv(form, 'managerId') || null,
            status: UI.fv(form, 'status'),
            email: UI.fv(form, 'email'), phone: UI.fv(form, 'phone')
          };
          if (emp) Employees.update(emp.id, data); else Employees.create(data);
          close(); UI.toast(t('savedOk'), 'success'); UI.render();
        } catch (e) { UI.toast(e.message, 'error'); }
        return false;
      }
    });
  },
  openDetails(id) {
    const emp = U.byId(Store.state.employees, id);
    if (!emp) return;
    const projects = Store.state.projects.filter(p => !p.archived && ((p.memberIds || []).includes(id) || p.managerEmployeeId === id));
    const tasks = Perms.visible('tasks', Store.state.tasks).filter(x => (x.assigneeIds || []).includes(id) && !x.archived);
    const user = Store.state.users.find(u => u.employeeId === id);
    UI.modal({
      title: emp.fullName,
      large: true,
      body: '<div class="flex mb-2"><span class="avatar lg">' + U.esc(UI.initials(emp.fullName)) + '</span><div>' +
        '<h3 class="mb-0">' + U.esc(emp.fullName) + '</h3><div class="muted">' + U.esc(emp.jobTitle || '') + ' — ' + U.esc(emp.empNo) + '</div>' +
        '<span class="pill ' + (emp.status === 'active' ? 'p-ok' : 'p-muted') + '">' + U.esc(t(emp.status === 'active' ? 'empActive' : emp.status === 'inactive' ? 'empInactive' : 'empArchived')) + '</span></div></div>' +
        '<dl class="kv">' +
        '<dt>' + t('department') + '</dt><dd>' + U.esc(Reports.deptName(emp.departmentId)) + '</dd>' +
        '<dt>' + t('team') + '</dt><dd>' + U.esc((U.byId(Store.state.teams, emp.teamId) || {}).name || '—') + '</dd>' +
        '<dt>' + t('manager') + '</dt><dd>' + U.esc(emp.managerId ? Employees.displayName(Employees.get(emp.managerId)) : '—') + '</dd>' +
        '<dt>' + t('email') + '</dt><dd>' + U.esc(emp.email || '—') + '</dd>' +
        '<dt>' + t('phone') + '</dt><dd>' + U.esc(emp.phone || '—') + '</dd>' +
        '<dt>' + t('linkEmployee') + '</dt><dd>' + (user ? U.esc(user.username) : t('unassigned')) + '</dd>' +
        '<dt>' + t('workload') + '</dt><dd>' + Employees.workload(id) + '</dd>' +
        '</dl>' +
        '<h4 class="mt-2">' + t('assignedProjects') + '</h4>' +
        (projects.map(p => '<span class="tag">' + U.esc(p.title) + '</span>').join('') || '<div class="muted small">' + t('noData') + '</div>') +
        '<h4 class="mt-2">' + t('assignedTasks') + ' (' + tasks.length + ')</h4>' +
        (tasks.length ? '<ul class="timeline">' + tasks.slice(0, 10).map(x => '<li><div class="tl-head"><a href="#" data-task="' + x.id + '">' + U.esc(x.title) + '</a>' + Widgets.statusPill('task', x.status) + '</div></li>').join('') + '</ul>' : '<div class="muted small">' + t('noData') + '</div>'),
      foot: null
    });
    document.querySelectorAll('[data-task]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector('.modal-overlay') && document.querySelector('.modal-overlay').remove();
      TaskViews.openDetails(a.dataset.task);
    }));
  }
};

UI.registerView({
  id: 'org',
  module: 'org',
  title: () => t('orgChart'),
  render() {
    const canEdit = Perms.can('org', 'edit');
    const depts = Store.state.departments;
    const roots = depts.filter(d => !d.parentId || !U.byId(depts, d.parentId));
    const renderDept = (d, depth) => {
      const children = depts.filter(x => x.parentId === d.id);
      const emps = Store.state.employees.filter(e => e.departmentId === d.id && e.status === 'active');
      const teams = Store.state.teams.filter(tm => tm.departmentId === d.id);
      const mgr = d.managerEmployeeId ? Employees.get(d.managerEmployeeId) : null;
      return '<li><details open><summary><span class="tree-toggle">▾</span>🏢 <b>' + U.esc(d.name) + '</b>' +
        (mgr ? '<span class="muted small">— ' + U.esc(mgr.fullName) + '</span>' : '') +
        '<span class="pill p-muted">' + t('members_count', { n: emps.length }) + '</span>' +
        (canEdit ? '<button class="btn btn-sm btn-ghost" data-edit-dept="' + d.id + '">' + t('edit') + '</button>' : '') + '</summary>' +
        '<ul>' +
        teams.map(tm => {
          const teamEmps = emps.filter(e => e.teamId === tm.id);
          return '<li><details open><summary><span class="tree-toggle">▾</span>👤 <b>' + U.esc(tm.name) + '</b>' +
            (tm.leadEmployeeId ? '<span class="muted small">— ' + U.esc(Employees.displayName(Employees.get(tm.leadEmployeeId))) + '</span>' : '') +
            '<span class="pill p-muted">' + t('members_count', { n: teamEmps.length }) + '</span>' +
            (canEdit ? '<button class="btn btn-sm btn-ghost" data-edit-team="' + tm.id + '">' + t('edit') + '</button>' : '') + '</summary>' +
            '<ul>' + teamEmps.map(e => '<li><span style="padding-inline-start:16px;display:inline-block">' + U.esc(e.fullName) + ' <span class="muted small">(' + U.esc(e.jobTitle || '') + ')</span></span></li>').join('') + '</ul></details></li>';
        }).join('') +
        emps.filter(e => !e.teamId || !teams.some(tm => tm.id === e.teamId)).map(e =>
          '<li><span style="padding-inline-start:16px;display:inline-block">👤 ' + U.esc(e.fullName) + ' <span class="muted small">(' + U.esc(e.jobTitle || '') + ')</span></span></li>').join('') +
        children.map(c => renderDept(c, depth + 1)).join('') +
        '</ul></details></li>';
    };
    return '<div class="btn-row mb-2">' +
      (Perms.can('org', 'create') ? '<button class="btn btn-primary" id="btn-new-dept">+ ' + t('newDepartment') + '</button>' +
        '<button class="btn" id="btn-new-team">+ ' + t('newTeam') + '</button>' : '') +
      '</div>' +
      (roots.length ? '<div class="card"><ul class="tree">' + roots.map(d => renderDept(d, 0)).join('') + '</ul></div>'
        : '<div class="card empty-state"><div class="icon">🏢</div><p>' + t('noData') + '</p></div>');
  },
  bind() {
    const nd = document.getElementById('btn-new-dept');
    if (nd) nd.addEventListener('click', () => this.deptForm(null));
    const nt = document.getElementById('btn-new-team');
    if (nt) nt.addEventListener('click', () => this.teamForm(null));
    document.querySelectorAll('[data-edit-dept]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); this.deptForm(b.dataset.editDept);
    }));
    document.querySelectorAll('[data-edit-team]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); this.teamForm(b.dataset.editTeam);
    }));
  },
  deptForm(id) {
    const d = id ? U.byId(Store.state.departments, id) : null;
    UI.formModal({
      title: d ? t('edit') : t('newDepartment'),
      body: '<div class="field"><label>' + t('name') + ' *</label><input name="name" required value="' + U.esc(d ? d.name : '') + '"></div>' +
        Widgets.selectField('parentId', t('parentDept'), Widgets.deptOptions().filter(o => !d || o.value !== d.id), d ? d.parentId : '', { empty: t('none') }) +
        Widgets.selectField('managerEmployeeId', t('deptManager'), Widgets.employeeOptions(), d ? d.managerEmployeeId : '', { empty: t('select') }),
      onSubmit(form, close) {
        try {
          const data = { name: UI.fv(form, 'name'), parentId: UI.fv(form, 'parentId') || null, managerEmployeeId: UI.fv(form, 'managerEmployeeId') || null };
          if (d) Org.updateDepartment(d.id, data); else Org.createDepartment(data);
          close(); UI.toast(t('savedOk'), 'success'); UI.render();
        } catch (e) { UI.toast(e.message, 'error'); }
        return false;
      }
    });
  },
  teamForm(id) {
    const tm = id ? U.byId(Store.state.teams, id) : null;
    UI.formModal({
      title: tm ? t('edit') : t('newTeam'),
      body: '<div class="field"><label>' + t('name') + ' *</label><input name="name" required value="' + U.esc(tm ? tm.name : '') + '"></div>' +
        Widgets.selectField('departmentId', t('department'), Widgets.deptOptions(), tm ? tm.departmentId : '', { empty: t('select') }) +
        Widgets.selectField('leadEmployeeId', t('teamLead'), Widgets.employeeOptions(), tm ? tm.leadEmployeeId : '', { empty: t('select') }),
      onSubmit(form, close) {
        try {
          const data = { name: UI.fv(form, 'name'), departmentId: UI.fv(form, 'departmentId') || null, leadEmployeeId: UI.fv(form, 'leadEmployeeId') || null };
          if (tm) Org.updateTeam(tm.id, data); else Org.createTeam(data);
          close(); UI.toast(t('savedOk'), 'success'); UI.render();
        } catch (e) { UI.toast(e.message, 'error'); }
        return false;
      }
    });
  }
});
