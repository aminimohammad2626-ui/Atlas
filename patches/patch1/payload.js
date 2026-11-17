/* Atlas-patch1: Announcements module. Runs with the shared Atlas extension API. */
(function (Atlas) {
  const { Store, UI, U, Widgets, Perms, Auth, Notifications, Cal } = Atlas;
  const t = Atlas.t;

  Atlas.registerModule({ id: 'announcements', ops: ['view', 'create', 'edit', 'delete'] });

  const Ann = {
    collection() { return Store.state.announcements || []; },
    canSee(a) {
      const user = Auth.currentUser();
      if (!user) return false;
      if (Perms.isOrgAdmin(user)) return true;
      if (a.createdBy === user.id) return true;
      if (a.audience === 'all') return true;
      if (a.audience === 'employees') return true;
      if (a.audience === 'managers') return Perms.can('users', 'view');
      return false;
    },
    visible() { return this.collection().filter(a => this.canSee(a)); },
    create(data) {
      Perms.assert('announcements', 'create');
      if (!data.title || !data.title.trim()) throw new Error(t('required'));
      if (!data.body || !data.body.trim()) throw new Error(t('required'));
      const a = {
        id: U.uid('ann'),
        title: data.title.trim(),
        body: data.body.trim(),
        audience: ['all', 'employees', 'managers'].includes(data.audience) ? data.audience : 'all',
        pinned: !!data.pinned,
        createdBy: Auth.currentUserId(),
        createdAt: U.nowISO(),
        publishedAt: null
      };
      Store.state.announcements.push(a);
      Store.audit('createAnnouncement', 'announcement:' + a.id, null, a.title);
      if (data.publish) this.publish(a.id, { skipPerm: true });
      Store.markDirty();
      return a;
    },
    publish(id, opts) {
      if (!(opts && opts.skipPerm)) Perms.assert('announcements', 'edit');
      const a = U.byId(this.collection(), id);
      if (!a) throw new Error(t('notFound'));
      a.publishedAt = U.nowISO();
      const targets = Store.state.users.filter(u => u.status === 'active').filter(u => {
        if (a.audience === 'all' || a.audience === 'employees') return true;
        if (a.audience === 'managers') return Perms.canUser(u, 'users', 'view');
        return false;
      }).map(u => u.id);
      Notifications.notifyUsers(targets, 'announcement', 'announcement', a.id, { title: a.title });
      Store.audit('publishAnnouncement', 'announcement:' + a.id, null, a.audience);
      Store.markDirty();
      return a;
    },
    remove(id) {
      Perms.assert('announcements', 'delete');
      const a = U.byId(this.collection(), id);
      if (!a) throw new Error(t('notFound'));
      Store.state.announcements = Store.state.announcements.filter(x => x.id !== id);
      Store.audit('deleteAnnouncement', 'announcement:' + id, a.title, null);
      Store.markDirty();
    }
  };

  UI.registerView({
    id: 'announcements', module: 'announcements', icon: '📢',
    title() { return t('announcements'); },
    render() {
      const list = Ann.visible().sort((x, y) => (y.pinned - x.pinned) || U.cmp(y.createdAt, x.createdAt));
      let html = '<div class="card mb-2 flex-between"><h3 class="mb-0">' + t('announcements') + '</h3>' +
        (Perms.can('announcements', 'create') ? '<button class="btn btn-primary" id="ann-new">' + t('newAnnouncement') + '</button>' : '') + '</div>';
      if (!list.length) {
        return html + '<div class="card"><div class="empty-state"><p>' + U.esc(t('announcements_empty')) + '</p></div></div>';
      }
      html += list.map(a => {
        const author = U.byId(Store.state.users, a.createdBy);
        return '<div class="card mb-2">' +
          '<div class="flex-between"><h4 class="mb-0">' + U.esc(a.title) + (a.pinned ? ' 📌' : '') + '</h4>' +
          (a.publishedAt ? '<span class="pill p-ok">' + U.esc(t('annPublished')) + '</span>' : '<span class="pill p-warn">' + U.esc(t('pending')) + '</span>') + '</div>' +
          '<p class="mt-1" style="white-space:pre-wrap">' + U.esc(a.body) + '</p>' +
          '<div class="muted small">' + U.esc(t('audAll') === '' ? '' : '') + UI.fmtTS(a.createdAt) +
          (author ? ' — ' + U.esc(Atlas.Users.displayName(author)) : '') + '</div>' +
          (Perms.can('announcements', 'edit') || Perms.can('announcements', 'delete') ?
            '<div class="btn-row mt-1">' +
            (!a.publishedAt && Perms.can('announcements', 'edit') ? '<button class="btn btn-sm" data-ann-pub="' + a.id + '">' + t('annPublish') + '</button>' : '') +
            (Perms.can('announcements', 'delete') ? '<button class="btn btn-sm btn-danger" data-ann-del="' + a.id + '">' + t('delete') + '</button>' : '') +
            '</div>' : '') +
          '</div>';
      }).join('');
      return html;
    },
    bind() {
      const btn = document.getElementById('ann-new');
      if (btn) btn.addEventListener('click', () => {
        UI.formModal({
          title: t('newAnnouncement'),
          body: '<div class="field"><label>' + t('title') + ' *</label><input name="title" required></div>' +
            '<div class="field"><label>' + t('annBody') + ' *</label><textarea name="body" rows="5" required></textarea></div>' +
            '<div class="field"><label>' + t('annAudience') + '</label><select name="audience">' +
            '<option value="all">' + t('audAll') + '</option>' +
            '<option value="employees">' + t('employees') + '</option>' +
            '<option value="managers">' + t('managers') + '</option></select></div>' +
            '<div class="field"><label class="flex-between">' + t('annPublish') + '? <input type="checkbox" name="publish" checked></label></div>',
          onSubmit(form, close) {
            try {
              const a = Ann.create({
                title: UI.fv(form, 'title'),
                body: UI.fv(form, 'body'),
                audience: UI.fv(form, 'audience'),
                publish: UI.fv(form, 'publish')
              });
              UI.toast(t('annPublished') + ': ' + a.title, 'success');
              close();
              UI.render();
            } catch (e) { UI.toast(e.message || e, 'error'); return false; }
          }
        });
      });
      document.querySelectorAll('[data-ann-pub]').forEach(b => b.addEventListener('click', () => {
        try { Ann.publish(b.dataset.annPub); UI.toast(t('annPublished'), 'success'); UI.render(); }
        catch (e) { UI.toast(e.message || e, 'error'); }
      }));
      document.querySelectorAll('[data-ann-del]').forEach(b => b.addEventListener('click', () => {
        UI.confirm(t('confirmDelete') + '?', () => {
          try { Ann.remove(b.dataset.annDel); UI.toast(t('deletedOk'), 'success'); UI.render(); }
          catch (e) { UI.toast(e.message || e, 'error'); }
        }, true);
      }));
    }
  });

  Atlas.registerReport({
    id: 'announcements', key: 'announcements',
    run() {
      return {
        head: [t('title'), t('annAudience'), t('date'), t('status')],
        rows: Ann.visible().map(a => [
          a.title,
          a.audience === 'all' ? t('audAll') : (a.audience === 'managers' ? t('managers') : t('employees')),
          Cal.formatISO(a.createdAt.slice(0, 10), Atlas.I18N.getLang()),
          a.publishedAt ? t('annPublished') : t('pending')
        ])
      };
    }
  });

  Store.markDirty();
})(Atlas);
