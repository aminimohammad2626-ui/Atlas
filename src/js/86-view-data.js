/* ===== Data views: settings, backup/restore, patch center, reports ===== */
UI.registerView({
  id: 'settings', module: 'settings',
  title() { return t('settings'); },
  render() {
    const s = Store.state.settings;
    const isAdmin = Perms.can('settings', 'edit');
    const langOpts = [{ value: 'fa', label: 'فارسی (RTL)' }, { value: 'en', label: 'English (LTR)' }];
    const themeOpts = [
      { value: 'simple', label: t('theme_simple') },
      { value: 'midnight', label: t('theme_midnight') },
      { value: 'classic', label: t('theme_classic') }
    ];
    let html = '<div class="grid-2">' +
      '<div class="card"><h3>' + t('settings') + '</h3>' +
      '<div class="field"><label>' + t('language') + '</label>' +
      '<select id="st-lang">' + langOpts.map(o => '<option value="' + o.value + '"' + (s.language === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>' + t('theme') + '</label>' +
      '<select id="st-theme">' + themeOpts.map(o => '<option value="' + o.value + '"' + (s.theme === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>' + t('experienceMode') + '</label>' +
      '<select id="st-mode"><option value="simple"' + (s.mode === 'simple' ? ' selected' : '') + '>' + t('mode_simple') + '</option>' +
      '<option value="detailed"' + (s.mode === 'detailed' ? ' selected' : '') + '>' + t('mode_detailed') + '</option></select></div>' +
      '<div class="field"><label>' + t('weekStart') + '</label>' +
      '<select id="st-weekstart"><option value="6"' + (s.weekStart === 6 ? ' selected' : '') + '>' + t('weekStartSat') + '</option>' +
      '<option value="1"' + (s.weekStart === 1 ? ' selected' : '') + '>' + t('weekStartMon') + '</option></select></div>' +
      '<div class="field"><label class="flex-between">' + t('autosave') + ' <input type="checkbox" id="st-autosave"' + (s.autosave ? ' checked' : '') + '></label></div>' +
      '<div class="field"><label>' + t('autosaveInterval') + ' (' + t('second') + ')</label>' +
      '<input type="number" id="st-autosave-int" min="15" max="3600" value="' + U.num(s.autosaveInterval, 60) + '"></div>' +
      '</div>';
    if (isAdmin) {
      html += '<div class="card"><h3>' + t('workflow') + ' / ' + t('options') + '</h3>' +
        '<div class="field"><label>' + t('defaultTaskStatus') + '</label>' +
        '<select id="st-def-task">' + Widgets.statusOptions('task').map(o => '<option value="' + o.value + '"' + (s.defaultTaskStatus === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>' + t('defaultProjectStatus') + '</label>' +
        '<select id="st-def-project">' + Widgets.statusOptions('project').map(o => '<option value="' + o.value + '"' + (s.defaultProjectStatus === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select></div>' +
        '</div>';
    }
    html += '<div class="card"><h3>' + t('appInfo') + '</h3><div class="kv">' +
      '<div>' + t('appName') + '</div><div>' + U.esc(t('appTitle')) + '</div>' +
      '<div>' + t('version') + '</div><div>' + APP_VERSION + '</div>' +
      '<div>' + t('schemaVersion') + '</div><div>' + Store.state.meta.schemaVersion + '</div>' +
      '<div>' + t('backupFormatVersion') + '</div><div>' + BACKUP_FORMAT_VERSION + '</div>' +
      '<div>' + t('patchHistory') + '</div><div>' + (Store.state.meta.installedPatches || []).length + '</div>' +
      '<div>' + t('stats') + '</div><div>' + Store.state.projects.length + ' ' + t('projects') + ' / ' + Store.state.tasks.length + ' ' + t('tasks') + ' / ' + Store.state.employees.length + ' ' + t('employees') + '</div>' +
      '</div></div></div>' +
      '<div class="btn-row mt-2"><button class="btn btn-primary" id="st-save">' + t('save') + '</button></div>';
    return html;
  },
  bind() {
    const s = Store.state.settings;
    document.getElementById('st-save').addEventListener('click', () => {
      const newLang = document.getElementById('st-lang').value;
      const newTheme = document.getElementById('st-theme').value;
      s.language = newLang;
      s.theme = newTheme;
      s.mode = document.getElementById('st-mode').value;
      s.weekStart = +document.getElementById('st-weekstart').value;
      s.autosave = document.getElementById('st-autosave').checked;
      s.autosaveInterval = U.clamp(U.num(document.getElementById('st-autosave-int').value, 60), 15, 3600);
      const dt = document.getElementById('st-def-task');
      const dp = document.getElementById('st-def-project');
      if (dt) s.defaultTaskStatus = dt.value;
      if (dp) s.defaultProjectStatus = dp.value;
      Store.audit('updateSettings', 'settings', null, null);
      Store.markDirty();
      Store.persist();
      SaveSys.scheduleAutosave();
      if (newLang !== I18N.getLang()) UI.toast(t('langChanged'), 'success');
      if (newTheme !== document.documentElement.dataset.theme) UI.toast(t('themeChanged'), 'success');
      UI.render();
    });
  }
});

UI.registerView({
  id: 'backup', module: 'backup',
  title() { return t('backup'); },
  render() {
    return '<div class="grid-2">' +
      '<div class="card"><h3>' + t('createBackup') + '</h3>' +
      '<p class="muted">' + U.esc(t('saveAppDesc')) + '</p>' +
      '<button class="btn btn-primary" id="bk-create">' + t('downloadBackup') + '</button>' +
      '<div class="kv mt-2"><div>' + t('backupFormatVersion') + '</div><div>' + BACKUP_FORMAT_VERSION + '</div>' +
      '<div>' + t('schemaVersion') + '</div><div>' + Store.state.meta.schemaVersion + '</div></div></div>' +
      '<div class="card"><h3>' + t('restoreBackup') + '</h3>' +
      '<p class="muted">' + U.esc(t('restoreFull')) + '</p>' +
      '<button class="btn" id="bk-restore">' + t('selectBackupFile') + '</button>' +
      '<div class="kv mt-2"><div>' + t('recoveryBackup') + '</div><div>' + t('restoreFull') + '</div></div></div>' +
      '</div>';
  },
  bind() {
    document.getElementById('bk-create').addEventListener('click', () => {
      try {
        const b = Backup.create();
        U.download('atlas-backup-' + Cal.todayISO() + '.json', JSON.stringify(b, null, 1), 'application/json');
        UI.toast(t('backupCreated'), 'success');
      } catch (e) { UI.toast(t('error') + ': ' + (e.message || e), 'error'); }
    });
    document.getElementById('bk-restore').addEventListener('click', () => this.wizard());
  },
  wizard() {
    let backup = null, validation = null, compat = null;
    const modal = UI.modal({
      title: t('restoreWizard'),
      large: true,
      body: '<div id="rw-body"></div>',
      foot: '<button class="btn" data-close>' + t('cancel') + '</button><button class="btn btn-primary" id="rw-next" disabled>' + t('next') + '</button>',
      onMount(el, close) {
        const body = el.querySelector('#rw-body');
        const next = el.querySelector('#rw-next');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';
        el.appendChild(fileInput);
        const stepSelect = () => {
          next.disabled = true;
          next.textContent = t('next');
          body.innerHTML = '<p>' + U.esc(t('selectBackupFile')) + '</p>' +
            '<button class="btn" id="rw-pick">' + t('selectBackupFile') + '</button>';
          body.querySelector('#rw-pick').addEventListener('click', () => fileInput.click());
        };
        fileInput.addEventListener('change', () => {
          const f = fileInput.files[0];
          if (!f) return;
          fileInput.value = '';
          U.readFileText(f).then(txt => {
            try {
              backup = JSON.parse(txt);
            } catch (e) {
              body.innerHTML = '<div class="field-error">' + U.esc(t('backupInvalid', { msg: 'JSON' })) + '</div>';
              return;
            }
            validation = Backup.validate(backup);
            compat = validation.ok ? Backup.compat(backup) : { ok: false };
            stepInspect();
          });
        });
        const stepInspect = () => {
          next.disabled = !validation.ok;
          if (!validation.ok) {
            body.innerHTML = '<div class="field-error">' + U.esc(t('backupInvalid', { msg: validation.msg })) + '</div>' +
              '<button class="btn mt-2" id="rw-again">' + t('selectBackupFile') + '</button>';
            body.querySelector('#rw-again').addEventListener('click', stepSelect);
            return;
          }
          const inv = backup.inventory || {};
          body.innerHTML =
            '<div class="pill p-ok mb-2">' + U.esc(t('backupValid')) + '</div>' +
            '<div class="kv">' +
            '<div>' + t('backupFormatVersion') + '</div><div>' + backup.formatVersion + '</div>' +
            '<div>' + t('version') + '</div><div>' + U.esc(backup.appVersion || '?') + '</div>' +
            '<div>' + t('schemaVersion') + '</div><div>' + backup.data.meta.schemaVersion + '</div>' +
            '<div>' + t('date') + '</div><div>' + Cal.formatTimestamp(backup.createdAt, I18N.getLang()) + '</div>' +
            '</div>' +
            '<h4 class="mt-2">' + t('backupInventory') + '</h4>' +
            '<table class="table"><thead><tr><th>' + t('module') + '</th><th>' + t('count') + '</th></tr></thead><tbody>' +
            Object.keys(inv).map(k => '<tr><td>' + U.esc(k) + '</td><td>' + inv[k] + '</td></tr>').join('') +
            '</tbody></table>';
          next.disabled = false;
          next.onclick = () => { stepCompat(); };
        };
        const stepCompat = () => {
          if (!compat.ok) {
            body.innerHTML = '<div class="field-error">' + U.esc(t('backupIncompatible') + ' (' + compat.msg + ')') + '</div>' +
              '<button class="btn mt-2" id="rw-again">' + t('selectBackupFile') + '</button>';
            body.querySelector('#rw-again').addEventListener('click', stepSelect);
            next.disabled = true;
            return;
          }
          body.innerHTML = '<div class="pill p-ok mb-2">' + U.esc(t('backupValid')) + '</div>' +
            '<p>' + U.esc(compat.migration ? t('migrationRequired', { from: compat.from, to: compat.to }) : t('patchCompat') + ': OK') + '</p>' +
            '<p class="muted">' + U.esc(t('restoreConfirm')) + '</p>';
          next.textContent = t('restoreBackup');
          next.onclick = () => {
            UI.confirm(t('restoreConfirm'), () => { stepRestore(); }, true);
          };
        };
        const stepRestore = () => {
          next.disabled = true;
          body.innerHTML = '<p>' + U.esc(t('checkpointCreated')) + '</p><p>' + U.esc(t('saving')) + '…</p>';
          setTimeout(() => {
            try {
              const res = Backup.restore(backup);
              body.innerHTML = '<div class="pill p-ok mb-2">' + U.esc(t('restoreDone')) + '</div>' +
                '<p>' + U.esc(t('restoreVerify')) + '</p>' +
                '<div class="kv">' + Object.keys(res.counts).map(k => '<div>' + U.esc(k) + '</div><div>' + res.counts[k] + '</div>').join('') + '</div>' +
                (res.migrated ? '<p class="muted mt-1">' + U.esc(t('migrationRequired', { from: compat.from, to: compat.to })) + '</p>' : '') +
                '<p class="muted mt-1">' + U.esc(t('unknownFieldsPreserved')) + '</p>';
              next.textContent = t('ok');
              next.disabled = false;
              next.onclick = () => { close(); Auth.restoreSession(); UI.nav('dashboard'); };
            } catch (e) {
              body.innerHTML = '<div class="field-error">' + U.esc(t('restoreFailed', { msg: e.message || e })) + '</div>' +
                '<p class="muted">' + U.esc(t('recoveryBackup')) + '</p>' +
                '<button class="btn mt-2" id="rw-again">' + t('selectBackupFile') + '</button>';
              body.querySelector('#rw-again').addEventListener('click', stepSelect);
            }
          }, 60);
        };
        stepSelect();
      }
    });
    return modal;
  }
});

UI.registerView({
  id: 'patchCenter', module: 'patch',
  title() { return t('patchCenter'); },
  render() {
    const installed = Store.state.meta.installedPatches || [];
    let html = '<div class="card mb-2"><h3>' + t('installPatch') + '</h3>' +
      '<p class="muted">' + U.esc(t('patchCenterDesc')) + '</p>' +
      '<p class="muted small">' + U.esc(t('patchChecksumNote')) + '</p>' +
      '<button class="btn btn-primary" id="pc-pick">' + t('selectPatchFile') + '</button>' +
      '<div id="pc-inspect" class="mt-2"></div></div>';
    html += '<div class="card mb-2"><h3>' + t('patchHistory') + '</h3>';
    if (!Store.state.patchHistory.length) {
      html += '<div class="empty-state"><p>' + U.esc(t('noData')) + '</p></div>';
    } else {
      html += '<table class="table"><thead><tr><th>' + t('name') + '</th><th>' + t('version') + '</th><th>' + t('patchPublisher') + '</th><th>' + t('patchInstalledAt') + '</th><th>' + t('patchResult') + '</th><th>' + t('actions') + '</th></tr></thead><tbody>';
      Store.state.patchHistory.slice().reverse().forEach(h => {
        html += '<tr><td>' + U.esc(I18N.getLang() === 'fa' && h.nameFa ? h.nameFa : h.name) + '</td><td>' + U.esc(h.version) + '</td><td>' + U.esc(h.publisher) + '</td><td>' + UI.fmtTS(h.installedAt) + '</td><td>' + U.esc(h.result) + '</td>' +
          '<td class="btn-row">' + (h.result === 'installed' ? '<button class="btn btn-sm" data-roll="' + U.esc(h.id) + '">' + t('patchRollback') + '</button>' : '') + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    if (installed.length) {
      html += '<div class="card"><h3>' + t('patchActivate') + '</h3><table class="table"><thead><tr><th>' + t('name') + '</th><th>' + t('version') + '</th><th>' + t('status') + '</th><th>' + t('actions') + '</th></tr></thead><tbody>';
      installed.forEach(p => {
        const active = p.active !== false && !!Store.state.activePatchPayloads[p.id] && Store.state.activePatchPayloads[p.id].active !== false;
        html += '<tr><td>' + U.esc(p.id) + '</td><td>' + U.esc(p.version) + '</td><td>' + (active ? t('active') : t('inactive')) + '</td>' +
          '<td class="btn-row">' + (active
            ? '<button class="btn btn-sm" data-deact="' + U.esc(p.id) + '">' + t('patchDeactivate') + '</button>'
            : '<button class="btn btn-sm" data-react="' + U.esc(p.id) + '">' + t('patchActivate') + '</button>') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    return html;
  },
  bind() {
    document.querySelectorAll('[data-roll]').forEach(b => b.addEventListener('click', () => {
      UI.confirm(t('patchRollback') + '?', () => {
        try { PatchCenter.rollback(b.dataset.roll); UI.toast(t('patchRolledBack'), 'success'); UI.render(); }
        catch (e) { UI.toast(e.message || e, 'error'); }
      }, true);
    }));
    document.querySelectorAll('[data-deact]').forEach(b => b.addEventListener('click', () => {
      try { PatchCenter.deactivate(b.dataset.deact); } catch (e) { UI.toast(e.message || e, 'error'); }
    }));
    document.querySelectorAll('[data-react]').forEach(b => b.addEventListener('click', () => {
      try { PatchCenter.reactivate(b.dataset.react); } catch (e) { UI.toast(e.message || e, 'error'); }
    }));
    const pick = document.getElementById('pc-pick');
    let fileInput = document.getElementById('pc-file');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'pc-file';
      fileInput.accept = '.json,application/json';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
    }
    pick.addEventListener('click', () => fileInput.click());
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      fileInput.value = '';
      U.readFileText(f).then(txt => {
        const box = document.getElementById('pc-inspect');
        let pkg = null;
        try { pkg = JSON.parse(txt); } catch (e) {
          box.innerHTML = '<div class="field-error">' + U.esc(t('patchBadFormat')) + '</div>';
          return;
        }
        const val = PatchCenter.validate(pkg);
        const compat = val.ok ? PatchCenter.compat(pkg) : { ok: false };
        const conflicts = val.ok && compat.ok ? PatchCenter.conflicts(pkg) : { ok: true };
        const trusted = pkg && PatchCenter.TRUSTED_PUBLISHERS.includes(pkg.publisher);
        const allOk = val.ok && compat.ok && conflicts.ok;
        let html = '<div class="kv">';
        if (pkg) {
          [['id', pkg.id], ['name', pkg.name], ['version', pkg.version], ['patchPublisher', pkg.publisher], ['patchCompat', (pkg.minAppVersion || '?') + ' … ' + (pkg.maxAppVersion || '∞')], ['patchDeps', (pkg.dependencies || []).join('، ') || '—'], ['patchConflicts', (pkg.conflicts || []).join('، ') || '—']]
            .forEach(([k, v]) => { html += '<div>' + U.esc(t(k)) + '</div><div>' + U.esc(String(v == null ? '—' : v)) + '</div>'; });
        }
        html += '</div>';
        html += '<div class="pill ' + (val.ok ? 'p-ok' : 'p-danger') + ' mt-1">' + U.esc(t('patchIntegrity') + ': ' + (val.ok ? 'OK' : val.msg)) + '</div> ';
        html += '<div class="pill ' + (trusted ? 'p-ok' : 'p-warn') + '">' + U.esc(trusted ? t('patchTrusted') : t('patchUntrusted')) + '</div> ';
        html += '<div class="pill ' + (compat.ok ? 'p-ok' : 'p-danger') + '">' + U.esc(t('patchCompat') + ': ' + (compat.ok ? 'OK' : compat.msg)) + '</div>';
        if (!conflicts.ok) html += '<div class="pill p-danger">' + U.esc(conflicts.msg) + '</div>';
        if (pkg && pkg.payload && pkg.payload.migration && pkg.payload.migration.toSchema > Store.state.meta.schemaVersion) {
          html += '<div class="pill p-info">' + U.esc(t('patchRequiresMigration') + ': ' + pkg.payload.migration.toSchema) + '</div>';
        }
        if (allOk) {
          html += '<div class="btn-row mt-2"><button class="btn btn-primary" id="pc-install">' + t('installPatch') + '</button></div>';
        } else {
          html += '<div class="field-error mt-1">' + U.esc(t('patchRejected')) + '</div>';
        }
        box.innerHTML = html;
        const btn = document.getElementById('pc-install');
        if (btn) btn.addEventListener('click', () => {
          try {
            const res = PatchCenter.install(pkg);
            UI.toast(t('patchInstalled') + ' (' + res.record.name + ' ' + res.record.version + ')', 'success');
            UI.render();
          } catch (e) {
            UI.toast(e.message || e, 'error');
            UI.render();
          }
        });
      });
    };
  }
});

UI.registerView({
  id: 'reports', module: 'reports',
  title() { return t('reports'); },
  render() {
    const defs = Reports.definitions();
    let html = '<div class="card mb-2"><div class="filter-row">' +
      '<select id="rp-id">' + defs.map(d => '<option value="' + d.id + '">' + U.esc(t(d.key)) + '</option>').join('') + '</select>' +
      '<select id="rp-project"><option value="">' + U.esc(t('project')) + ': ' + U.esc(t('all')) + '</option>' + Widgets.projectOptions().map(o => '<option value="' + o.value + '">' + U.esc(o.label) + '</option>').join('') + '</select>' +
      '<select id="rp-employee"><option value="">' + U.esc(t('employee')) + ': ' + U.esc(t('all')) + '</option>' + Widgets.employeeOptions().map(o => '<option value="' + o.value + '">' + U.esc(o.label) + '</option>').join('') + '</select>' +
      '<button class="btn btn-primary" id="rp-run">' + t('generateReport') + '</button>' +
      '<button class="btn" id="rp-csv">' + t('exportCsv') + '</button>' +
      '<button class="btn" id="rp-print">' + t('printReport') + '</button>' +
      '</div></div><div class="card" id="rp-out"><div class="empty-state"><p>' + U.esc(t('generateReport')) + '</p></div></div>';
    return html;
  },
  bind() {
    let last = null;
    const run = () => {
      const id = document.getElementById('rp-id').value;
      const filters = {
        projectId: document.getElementById('rp-project').value || undefined,
        employeeId: document.getElementById('rp-employee').value || undefined
      };
      last = Reports.run(id, filters);
      const out = document.getElementById('rp-out');
      if (!last.rows.length) {
        out.innerHTML = '<div class="empty-state"><p>' + U.esc(t('noData')) + '</p></div>';
        return;
      }
      out.innerHTML = '<h3>' + U.esc(t(document.getElementById('rp-id').selectedOptions[0].text)) + '</h3>' +
        '<div class="muted small mb-1">' + UI.fmtTS(U.nowISO()) + '</div>' +
        '<div class="table-scroll"><table class="table"><thead><tr>' + last.head.map(h => '<th>' + U.esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
        last.rows.map(r => '<tr>' + r.map(c => '<td>' + U.esc(String(c == null ? '' : c)) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>';
    };
    document.getElementById('rp-run').addEventListener('click', run);
    document.getElementById('rp-csv').addEventListener('click', () => {
      if (!last) run();
      if (last && last.rows.length) Reports.exportCsv(last);
      else UI.toast(t('noData'), 'warn');
    });
    document.getElementById('rp-print').addEventListener('click', () => window.print());
  }
});
