/* ===== Views: Users, Roles, Permission simulator, Workflow, Custom fields, Audit ===== */
UI.registerView({
  id: 'users',
  module: 'users',
  title: () => t('users'),
  render() {
    return '<div class="btn-row mb-1">' +
      (Perms.can('users', 'create') ? '<button class="btn btn-primary" id="btn-new-user">+ ' + t('newUser') + '</button>' : '') + '</div>' +
      '<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>' + t('username') + '</th><th>' + t('roles') + '</th><th>' + t('linkEmployee') + '</th><th>' + t('accountStatus') + '</th><th>' + t('lastLogin') + '</th><th></th></tr></thead><tbody>' +
      Store.state.users.map(u => {
        const emp = u.employeeId ? Employees.get(u.employeeId) : null;
        return '<tr>' +
          '<td>' + Widgets.userCell(Users.displayName(u), u.username) + '</td>' +
          '<td>' + (u.roles || []).map(r => '<span class="pill p-info">' + U.esc(Roles.roleLabelById(r)) + '</span>').join(' ') + '</td>' +
          '<td>' + U.esc(emp ? emp.fullName : '—') + '</td>' +
          '<td><span class="pill ' + (u.status === 'active' ? 'p-ok' : 'p-danger') + '">' + U.esc(u.status === 'active' ? t('active') : t('inactive')) + '</span></td>' +
          '<td>' + (u.lastLogin ? UI.fmtTS(u.lastLogin) : t('never')) + '</td>' +
          '<td class="row-actions">' +
          (Perms.can('users', 'edit', u) ? '<button class="btn btn-sm btn-ghost" data-edit="' + u.id + '">' + t('edit') + '</button>' +
            '<button class="btn btn-sm btn-ghost" data-reset="' + u.id + '">' + t('resetPassword') + '</button>' +
            '<button class="btn btn-sm btn-ghost" data-toggle="' + u.id + '">' + (u.status === 'active' ? t('disableAccount') : t('enableAccount')) + '</button>' : '') +
          (Perms.can('users', 'delete', u) ? '<button class="btn btn-sm btn-ghost" data-del="' + u.id + '">🗑</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  },
  bind() {
    const btn = document.getElementById('btn-new-user');
    if (btn) btn.addEventListener('click', () => AdminViews.userForm(null));
    document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => AdminViews.userForm(b.dataset.edit)));
    document.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
      UI.formModal({
        title: t('resetPassword'),
        body: '<div class="field"><label>' + t('newPassword') + ' *</label><input name="pw" type="password" required minlength="6"></div>',
        onSubmit(form, close) {
          const res = Auth.adminResetPassword(U.byId(Store.state.users, b.dataset.reset), UI.fv(form, 'pw'));
          if (!res.ok) { UI.toast(t(res.error), 'error'); return false; }
          close(); UI.toast(t('savedOk'), 'success');
        }
      });
    }));
    document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const u = U.byId(Store.state.users, b.dataset.toggle);
      try {
        Users.setStatus(u.id, u.status === 'active' ? 'disabled' : 'active');
        UI.toast(t('savedOk'), 'success'); UI.render();
      } catch (e) { UI.toast(e.message, 'error'); }
    }));
    document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      UI.confirm(t('confirmDelete'), () => {
        try { Users.delete(b.dataset.del); UI.toast(t('deletedOk'), 'success'); UI.render(); }
        catch (e) { UI.toast(e.message, 'error'); }
      });
    }));
  }
});

const AdminViews = {
  userForm(id) {
    const user = id ? U.byId(Store.state.users, id) : null;
    const isSelf = user && user.id === Auth.currentUserId();
    const roleOpts = Store.state.roles.map(r => ({ value: r.id, label: Roles.label(r) }));
    const empOpts = [{ value: '', label: t('none') }].concat(Widgets.employeeOptions());
    UI.formModal({
      title: user ? t('editUser') : t('newUser'),
      body: '<div class="form-grid">' +
        '<div class="field"><label>' + t('username') + (user ? '' : ' *') + '</label><input name="username" ' + (user ? 'disabled value="' + U.esc(user.username) + '"' : 'required') + '></div>' +
        '<div class="field"><label>' + t('name') + '</label><input name="displayName" value="' + U.esc(user ? user.displayName : '') + '"></div>' +
        (!user ? '<div class="field"><label>' + t('password') + ' *</label><input name="password" type="password" required minlength="6"></div>' : '') +
        Widgets.selectField('employeeId', t('linkEmployee'), empOpts, user ? user.employeeId : '') +
        '<div class="field span-2"><label>' + t('roles') + ' *</label><select name="roles" multiple size="6">' +
        roleOpts.map(o => '<option value="' + o.value + '"' + (user && (user.roles || []).includes(o.value) ? ' selected' : '') + '>' + U.esc(o.label) + '</option>').join('') +
        '</select><div class="hint">' + t('permsApplied') + '</div></div>' +
        '</div>',
      onSubmit(form, close) {
        try {
          const roles = Array.from(form.querySelector('[name="roles"]').selectedOptions).map(o => o.value);
          if (user) {
            Users.update(user.id, {
              displayName: UI.fv(form, 'displayName') || user.displayName,
              roles, employeeId: UI.fv(form, 'employeeId') || null
            });
          } else {
            Users.create({
              username: UI.fv(form, 'username'), displayName: UI.fv(form, 'displayName'),
              password: UI.fv(form, 'password'), roles, employeeId: UI.fv(form, 'employeeId') || null
            });
          }
          close(); UI.toast(t('roleChanged'), 'success'); UI.render();
        } catch (e) { UI.toast(e.message, 'error'); }
        return false;
      }
    });
  },

  permMatrixEditor(role, onSave) {
    const modules = Perms.MODULES;
    const scopes = Perms.SCOPES;
    let html = '<div class="table-wrap" style="max-height:420px;overflow-y:auto"><table class="data-table"><thead><tr><th>' + t('module') + '</th>' +
      ['view', 'create', 'edit', 'delete', 'assign', 'approve', 'export', 'archive', 'restore', 'configure'].map(op => '<th>' + t('op_' + op) + '</th>').join('') + '</tr></thead><tbody>';
    modules.forEach(m => {
      html += '<tr><td><b>' + U.esc(t(m.id === 'customfields' ? 'customFields' : m.id === 'patch' ? 'patchCenter' : m.id)) + '</b></td>';
      m.ops.forEach(op => {
        const cur = (role.perms[m.id] && role.perms[m.id][op]) || '';
        html += '<td><select data-m="' + m.id + '" data-op="' + op + '" style="min-width:86px">' +
          '<option value=""></option>' + scopes.map(s => '<option value="' + s + '"' + (cur === s ? ' selected' : '') + '>' + t('scope_' + s) + '</option>').join('') + '</select></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  },

  collectMatrix(container) {
    const perms = {};
    container.querySelectorAll('select[data-m]').forEach(sel => {
      if (!sel.value) return;
      perms[sel.dataset.m] = perms[sel.dataset.m] || {};
      perms[sel.dataset.m][sel.dataset.op] = sel.value;
    });
    return perms;
  }
};

UI.registerView({
  id: 'roles',
  module: 'roles',
  title: () => t('roles'),
  render() {
    return '<div class="btn-row mb-1">' +
      (Perms.can('roles', 'create') ? '<button class="btn btn-primary" id="btn-new-role">+ ' + t('newRole') + '</button>' : '') +
      '<button class="btn" id="btn-sim">' + t('permSimulator') + '</button></div>' +
      '<div class="grid grid-2">' +
      Store.state.roles.map(r => {
        const memberCount = Store.state.users.filter(u => (u.roles || []).includes(r.id)).length;
        const permCount = Object.values(r.perms || {}).reduce((a, m) => a + Object.keys(m).length, 0);
        return '<div class="card"><div class="flex-between"><h3 class="mb-0">' + U.esc(Roles.label(r)) +
          (r.system ? ' <span class="pill p-muted">' + t('systemRole') + '</span>' : '') + '</h3>' +
          (Perms.can('roles', 'edit') ? '<button class="btn btn-sm" data-edit="' + r.id + '">' + t('edit') + '</button>' : '') + '</div>' +
          '<p class="muted small">' + U.esc(r.description || (r.key ? t(r.key + '_d') || '' : '')) + '</p>' +
          '<div class="flex"><span class="pill p-info">' + t('users') + ': ' + memberCount + '</span><span class="pill">' + t('permission') + ': ' + permCount + '</span></div>' +
          '</div>';
      }).join('') + '</div>';
  },
  bind() {
    const btn = document.getElementById('btn-new-role');
    if (btn) btn.addEventListener('click', () => AdminViews.roleForm(null));
    document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => AdminViews.roleForm(b.dataset.edit)));
    document.getElementById('btn-sim').addEventListener('click', () => AdminViews.simulator());
  }
});

AdminViews.roleForm = function (id) {
  const role = id ? U.byId(Store.state.roles, id) : null;
  if (role && role.system && !Perms.isAdmin(Auth.currentUser())) { UI.toast(t('permDenied'), 'error'); return; }
  UI.formModal({
    title: role ? t('editRole') : t('newRole'),
    large: true,
    body: '<div class="form-grid">' +
      '<div class="field"><label>' + t('name') + ' (FA) *</label><input name="nameFa" required value="' + U.esc(role ? role.nameFa : '') + '"></div>' +
      '<div class="field"><label>' + t('name') + ' (EN)</label><input name="nameEn" value="' + U.esc(role ? role.nameEn : '') + '"></div>' +
      '<div class="field span-2"><label>' + t('description') + '</label><input name="description" value="' + U.esc(role ? role.description : '') + '"></div>' +
      '</div><h4>' + t('permMatrix') + '</h4>' + AdminViews.permMatrixEditor(role || { perms: {} }) +
      '<div class="field mt-1"><label>' + t('grants') + ' (module:op:scope, comma-separated)</label><input name="grants" value="' + U.esc(role ? '' : '') + '"></div>',
    onSubmit(form, close) {
      try {
        const perms = AdminViews.collectMatrix(form);
        const data = { nameFa: UI.fv(form, 'nameFa'), nameEn: UI.fv(form, 'nameEn'), description: UI.fv(form, 'description'), perms };
        if (role) Roles.update(role.id, data); else Roles.create(data);
        close(); UI.toast(t('savedOk'), 'success'); UI.render();
      } catch (e) { UI.toast(e.message, 'error'); }
      return false;
    }
  });
};

AdminViews.simulator = function () {
  const userOpts = Store.state.users.map(u => ({ value: u.id, label: Users.displayName(u) + ' (' + u.username + ')' }));
  UI.formModal({
    title: t('permSimulator'),
    body: Widgets.selectField('userId', t('users'), userOpts, Store.state.users[0] ? Store.state.users[0].id : '') + '<div id="sim-result"></div>',
    onMount(el) {
      const render = () => {
        const uid = el.querySelector('[name="userId"]').value;
        const eff = Perms.simulateUser(uid);
        const u = U.byId(Store.state.users, uid);
        let html = '<div class="mb-1">' + (u.roles || []).map(r => '<span class="pill p-info">' + U.esc(Roles.roleLabelById(r)) + '</span>').join(' ') + '</div>';
        html += '<div class="table-wrap" style="max-height:300px;overflow-y:auto"><table class="data-table"><thead><tr><th>' + t('module') + '</th><th>' + t('permission') + '</th></tr></thead><tbody>';
        Perms.MODULES.forEach(m => {
          const ops = eff[m.id] ? Object.entries(eff[m.id]) : [];
          if (!ops.length) return;
          html += '<tr><td><b>' + U.esc(t(m.id === 'customfields' ? 'customFields' : m.id === 'patch' ? 'patchCenter' : m.id)) + '</b></td><td>' +
            ops.map(([op, scope]) => '<span class="pill">' + t('op_' + op) + ': ' + t('scope_' + scope) + '</span>').join(' ') + '</td></tr>';
        });
        html += '</tbody></table></div>';
        el.querySelector('#sim-result').innerHTML = html;
      };
      el.querySelector('[name="userId"]').addEventListener('change', render);
      render();
    },
    onSubmit: () => false
  });
};

UI.registerView({
  id: 'workflow',
  module: 'workflow',
  title: () => t('workflow'),
  render() {
    const wf = Store.state.workflow;
    const renderStatuses = kind => {
      const list = Store.state.statuses[kind];
      return '<table class="data-table"><thead><tr><th>' + t('statusLabel') + ' (FA)</th><th>(EN)</th><th>' + t('statusKind') + '</th><th></th></tr></thead><tbody>' +
        list.map(s => '<tr><td><input data-k="' + kind + '" data-id="' + s.id + '" data-f="fa" value="' + U.esc(s.fa) + '"></td>' +
          '<td><input data-k="' + kind + '" data-id="' + s.id + '" data-f="en" value="' + U.esc(s.en) + '"></td>' +
          '<td><select data-k="' + kind + '" data-id="' + s.id + '" data-f="kind">' +
          ['open', 'active', 'done', 'cancelled'].map(k => '<option value="' + k + '"' + (s.kind === k ? ' selected' : '') + '>' + t('kind_' + k) + '</option>').join('') + '</select></td>' +
          '<td></td></tr>').join('') + '</tbody></table>';
    };
    const renderTransitions = kind => {
      const tr = wf[kind].transitions;
      const ids = Store.state.statuses[kind].map(s => s.id);
      return '<table class="data-table"><thead><tr><th>' + t('transitionFrom') + '</th><th>' + t('transitionTo') + '</th></tr></thead><tbody>' +
        ids.map(from => '<tr><td>' + U.esc(Workflow.statusLabel(kind, from)) + '</td><td>' +
          ids.filter(x => x !== from).map(to => '<label class="checkbox-row" style="display:inline-flex;margin-inline-end:12px"><input type="checkbox" data-tr-kind="' + kind + '" data-from="' + from + '" data-to="' + to + '"' + ((tr[from] || []).includes(to) ? ' checked' : '') + '> ' + U.esc(Workflow.statusLabel(kind, to)) + '</label>').join('') +
          '</td></tr>').join('') + '</tbody></table>';
    };
    return '<div class="grid grid-2">' +
      '<div class="card"><h3>' + t('taskStatuses') + '</h3>' + renderStatuses('task') + '</div>' +
      '<div class="card"><h3>' + t('projectStatuses') + '</h3>' + renderStatuses('project') + '</div>' +
      '<div class="card"><h3>' + t('transitions') + ' — ' + t('tasks') + '</h3>' + renderTransitions('task') + '</div>' +
      '<div class="card"><h3>' + t('transitions') + ' — ' + t('projects') + '</h3>' + renderTransitions('project') + '</div>' +
      '<div class="card"><h3>' + t('stage') + '</h3><p class="muted small">' + t('taskStatuses') + '</p>' +
      '<div class="field"><label>' + t('stage') + ' (task)</label><input id="wf-stages" value="' + U.esc((wf.task.stages || []).join(', ')) + '"></div>' +
      '<div class="field checkbox-row"><input type="checkbox" id="wf-reqres"' + (wf.task.requireResultOnDone ? ' checked' : '') + '><label for="wf-reqres" style="margin:0">' + t('requireResultOnDone') + '</label></div>' +
      '</div></div>' +
      (Perms.can('workflow', 'configure') ? '<button class="btn btn-primary" id="wf-save">' + t('save') + '</button>' : '');
  },
  bind() {
    const save = document.getElementById('wf-save');
    if (!save) return;
    save.addEventListener('click', () => {
      try {
        document.querySelectorAll('input[data-k],select[data-k]').forEach(el => {
          const s = U.byId(Store.state.statuses[el.dataset.k], el.dataset.id);
          if (s) s[el.dataset.f] = el.value;
        });
        ['task', 'project'].forEach(kind => {
          const tr = Store.state.workflow[kind].transitions;
          Object.keys(tr).forEach(k => delete tr[k]);
          document.querySelectorAll('input[data-tr-kind="' + kind + '"]:checked').forEach(cb => {
            tr[cb.dataset.from] = tr[cb.dataset.from] || [];
            tr[cb.dataset.from].push(cb.dataset.to);
          });
        });
        Store.state.workflow.task.stages = String(UI.fv(document.getElementById('wf-stages'), 'wf-stages') || document.getElementById('wf-stages').value).split(/[,،]/).map(x => x.trim()).filter(Boolean);
        Store.state.workflow.task.requireResultOnDone = document.getElementById('wf-reqres').checked;
        Store.audit('updateWorkflow', 'workflow', null, null);
        Store.markDirty();
        UI.toast(t('workflowSaved'), 'success');
      } catch (e) { UI.toast(e.message, 'error'); }
    });
  }
});

UI.registerView({
  id: 'customfields',
  module: 'customfields',
  title: () => t('customFields'),
  render() {
    return '<div class="btn-row mb-1">' +
      (Perms.can('customfields', 'create') ? '<button class="btn btn-primary" id="btn-new-cf">+ ' + t('newCustomField') + '</button>' : '') + '</div>' +
      (Store.state.customFields.length ? '<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>' + t('title') + '</th><th>' + t('appliesTo') + '</th><th>' + t('fieldType') + '</th><th></th></tr></thead><tbody>' +
        Store.state.customFields.map(f => '<tr><td>' + U.esc(f.labelFa) + ' / ' + U.esc(f.labelEn || '') + '</td>' +
          '<td>' + U.esc(f.appliesTo === 'task' ? t('tasks') : t('projects')) + '</td>' +
          '<td>' + t('ft_' + f.type) + '</td>' +
          '<td>' + (Perms.can('customfields', 'delete') ? '<button class="btn btn-sm btn-ghost" data-del="' + f.id + '">🗑</button>' : '') + '</td></tr>').join('') +
        '</tbody></table></div></div>' : '<div class="card empty-state">' + t('noData') + '</div>');
  },
  bind() {
    const btn = document.getElementById('btn-new-cf');
    if (btn) btn.addEventListener('click', () => {
      UI.formModal({
        title: t('newCustomField'),
        body: '<div class="form-grid">' +
          '<div class="field"><label>' + t('title') + ' (FA) *</label><input name="labelFa" required></div>' +
          '<div class="field"><label>' + t('title') + ' (EN)</label><input name="labelEn"></div>' +
          Widgets.selectField('appliesTo', t('appliesTo'), [{ value: 'task', label: t('tasks') }, { value: 'project', label: t('projects') }], 'task') +
          Widgets.selectField('type', t('fieldType'), ['text', 'number', 'date', 'select'].map(x => ({ value: x, label: t('ft_' + x) })), 'text') +
          '<div class="field span-2"><label>' + t('options') + ' (,)</label><input name="options"></div></div>',
        onSubmit(form, close) {
          Store.state.customFields.push({
            id: U.uid('cf'), appliesTo: UI.fv(form, 'appliesTo'),
            labelFa: UI.fv(form, 'labelFa'), labelEn: UI.fv(form, 'labelEn') || UI.fv(form, 'labelFa'),
            type: UI.fv(form, 'type'),
            options: Widgets.parseTags(UI.fv(form, 'options'))
          });
          Store.markDirty(); close(); UI.render();
        }
      });
    });
    document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      UI.confirm(t('confirmDelete'), () => {
        Store.state.customFields = Store.state.customFields.filter(f => f.id !== b.dataset.del);
        Store.markDirty(); UI.render();
      });
    }));
  }
});

UI.registerView({
  id: 'auditLog',
  module: 'audit',
  title: () => t('auditLog'),
  render() {
    const log = Store.state.auditLog.slice().reverse().slice(0, 200);
    return '<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>' + t('auditTime') + '</th><th>' + t('auditActor') + '</th><th>' + t('auditAction') + '</th><th>' + t('auditTarget') + '</th></tr></thead><tbody>' +
      log.map(a => '<tr><td class="nowrap">' + UI.fmtTS(a.at) + '</td><td>' + U.esc(Reports.userName(a.actorId)) + '</td>' +
        '<td>' + U.esc(a.action) + '</td><td class="mono">' + U.esc(a.target) + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }
});
