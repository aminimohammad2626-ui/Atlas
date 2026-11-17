/* ===== Notifications & global search views ===== */
UI.registerView({
  id: 'notifications', module: 'notifications',
  title() { return t('notifications'); },
  render() {
    const list = Notifications.forCurrentUser();
    let html = '<div class="card"><div class="flex-between mb-2"><h3>' + t('notifications') + '</h3>' +
      '<button class="btn btn-sm" id="ntf-readall">' + t('markAllRead') + '</button></div>';
    if (!list.length) {
      html += '<div class="empty-state"><p>' + U.esc(t('noData')) + '</p></div>';
    } else {
      html += '<ul class="timeline">';
      list.slice(0, 200).forEach(n => {
        html += '<li' + (n.read ? '' : ' style="font-weight:600"') + ' data-id="' + n.id + '" role="button" tabindex="0"><div class="tl-head"><span>' + U.esc(Notifications.label(n)) + '</span><span class="tl-time">' + UI.fmtTS(n.at) + '</span></div></li>';
      });
      html += '</ul>';
    }
    return html + '</div>';
  },
  bind() {
    document.getElementById('ntf-readall').addEventListener('click', () => {
      Notifications.markAllRead();
      UI.render();
    });
    document.querySelectorAll('.timeline li[data-id]').forEach(el => el.addEventListener('click', () => {
      const n = U.byId(Store.state.notifications, el.dataset.id);
      Notifications.markRead(n.id);
      if (n.refType === 'task' && Perms.can('tasks', 'view')) { TaskViews.openDetails(n.refId); UI.render(); }
      else if (n.refType === 'project' && Perms.can('projects', 'view')) { UI.nav('projectDetail', { id: n.refId }); }
      else UI.render();
    }));
  }
});

UI.registerView({
  id: 'search', module: null,
  title() { return t('globalSearch'); },
  render(params) {
    const q = params && params.q ? params.q : '';
    let html = '<div class="card mb-2"><form id="gs-form" class="filter-row">' +
      '<input type="search" name="q" id="gs-q" value="' + U.esc(q) + '" placeholder="' + U.esc(t('globalSearch')) + '" style="max-width:420px">' +
      '<button class="btn btn-primary" type="submit">' + t('search') + '</button></form></div>';
    if (!q) return html;
    const res = Search.run(q);
    const total = res.projects.length + res.tasks.length + res.employees.length + res.users.length;
    html += '<div class="muted small mb-1">' + total + ' ' + t('searchResults') + '</div>';
    if (!total) return html + '<div class="card"><div class="empty-state"><p>' + U.esc(t('noData')) + '</p></div></div>';
    if (res.projects.length) {
      html += '<div class="card mb-2"><h3>' + t('projects') + '</h3><table class="table"><tbody>' +
        res.projects.map(p => '<tr class="row-link" data-nav-view="projectDetail" data-id="' + p.id + '"><td>' + U.esc(p.title) + '</td><td>' + Widgets.statusPill('project', p.status) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }
    if (res.tasks.length) {
      html += '<div class="card mb-2"><h3>' + t('tasks') + '</h3><table class="table"><tbody>' +
        res.tasks.map(x => '<tr class="row-link" data-open-task="' + x.id + '"><td>' + U.esc(x.title) + '</td><td>' + Widgets.statusPill('task', x.status) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }
    if (res.employees.length) {
      html += '<div class="card mb-2"><h3>' + t('employees') + '</h3><table class="table"><tbody>' +
        res.employees.map(e => '<tr class="row-link" data-open-emp="' + e.id + '"><td>' + U.esc(e.fullName) + '</td><td>' + U.esc(e.empNo) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }
    if (res.users.length) {
      html += '<div class="card mb-2"><h3>' + t('users') + '</h3><table class="table"><tbody>' +
        res.users.map(u => '<tr><td>' + U.esc(u.username) + '</td><td>' + U.esc(Users.displayName(u)) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }
    return html;
  },
  bind(params) {
    const form = document.getElementById('gs-form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      UI.nav('search', { q: document.getElementById('gs-q').value });
    });
    document.querySelectorAll('[data-open-task]').forEach(el => el.addEventListener('click', () => TaskViews.openDetails(el.dataset.openTask)));
    document.querySelectorAll('[data-open-emp]').forEach(el => el.addEventListener('click', () => EmployeeViews.openDetails(el.dataset.openEmp)));
    document.querySelectorAll('[data-nav-view]').forEach(el => el.addEventListener('click', () => UI.nav(el.dataset.navView, { id: el.dataset.id })));
  }
});
