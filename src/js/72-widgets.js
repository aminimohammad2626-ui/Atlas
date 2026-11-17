/* ===== Shared widgets: datepicker, selects, pills, pagination ===== */
const Widgets = {
  datepicker(inputId, opts) {
    opts = opts || {};
    const input = document.getElementById(inputId);
    if (!input) return;
    const lang = I18N.getLang();
    const sys = Cal.systemFor(lang);
    input.readOnly = true;
    input.style.cursor = 'pointer';
    input.setAttribute('data-iso', opts.value || '');
    const show = () => {
      const currentISO = input.getAttribute('data-iso') || Cal.todayISO();
      const p = Cal.isoToParts(currentISO, sys) || Cal.isoToParts(Cal.todayISO(), sys);
      let y = p.y, m = p.m;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.alignItems = 'center';
      const draw = () => {
        const len = Cal.monthLen(y, m, sys);
        const grid = Cal.monthGridStart(y, m, sys, Store.state.settings.weekStart);
        const startISO = Cal.addDays(grid.firstISO, -grid.startIdx);
        let cells = '';
        for (let i = 0; i < 42; i++) {
          const iso = Cal.addDays(startISO, i);
          const pp = Cal.isoToParts(iso, sys);
          const inMonth = pp.m === m && pp.y === y;
          const isToday = iso === Cal.todayISO();
          const isSel = iso === input.getAttribute('data-iso');
          cells += '<button type="button" class="dp-day' + (inMonth ? '' : ' dp-out') + (isToday ? ' dp-today' : '') + (isSel ? ' dp-sel' : '') + '" data-iso="' + iso + '" style="' +
            (isSel ? 'background:var(--accent);color:#fff;' : '') + '">' + pp.d + '</button>';
        }
        const months = sys === 'jalali' ? Cal.FA_MONTHS : Cal.EN_MONTHS;
        const monthOpts = months.map((mn, i) => '<option value="' + (i + 1) + '"' + (i + 1 === m ? ' selected' : '') + '>' + mn + '</option>').join('');
        overlay.innerHTML = '<div class="modal" style="max-width:320px"><div class="modal-body">' +
          '<div class="flex-between mb-1">' +
          '<button type="button" class="btn btn-sm btn-icon" data-nav="-1">‹</button>' +
          '<select id="dp-month" style="width:auto">' + monthOpts + '</select>' +
          '<input id="dp-year" type="number" value="' + y + '" style="width:90px" min="' + (sys === 'jalali' ? 1300 : 1900) + '" max="' + (sys === 'jalali' ? 1600 : 2200) + '">' +
          '<button type="button" class="btn btn-sm btn-icon" data-nav="1">›</button></div>' +
          '<div class="dp-grid">' + (sys === 'jalali' ? Cal.FA_WEEKDAYS_SHORT : Cal.EN_WEEKDAYS_SHORT).map(d => '<div class="dp-wd">' + d + '</div>').join('') + cells + '</div>' +
          '<div class="btn-row mt-1"><button type="button" class="btn btn-sm" id="dp-today">' + t('today') + '</button>' +
          '<button type="button" class="btn btn-sm" id="dp-clear">' + t('clear') + '</button></div>' +
          '</div></div>';
        overlay.querySelector('[data-nav="-1"]').addEventListener('click', () => { const nm = Cal.addMonths(y, m, -1, sys); y = nm.y; m = nm.m; draw(); });
        overlay.querySelector('[data-nav="1"]').addEventListener('click', () => { const nm = Cal.addMonths(y, m, 1, sys); y = nm.y; m = nm.m; draw(); });
        overlay.querySelector('#dp-month').addEventListener('change', e => { m = +e.target.value; draw(); });
        overlay.querySelector('#dp-year').addEventListener('change', e => { y = U.clamp(+e.target.value || y, sys === 'jalali' ? 1300 : 1900, sys === 'jalali' ? 1600 : 2200); draw(); });
        overlay.querySelectorAll('.dp-day').forEach(b => b.addEventListener('click', () => {
          input.setAttribute('data-iso', b.dataset.iso);
          input.value = Cal.formatISO(b.dataset.iso, lang);
          overlay.remove();
          if (opts.onChange) opts.onChange(b.dataset.iso);
        }));
        overlay.querySelector('#dp-today').addEventListener('click', () => {
          input.setAttribute('data-iso', Cal.todayISO());
          input.value = Cal.formatISO(Cal.todayISO(), lang);
          overlay.remove();
          if (opts.onChange) opts.onChange(Cal.todayISO());
        });
        overlay.querySelector('#dp-clear').addEventListener('click', () => {
          input.setAttribute('data-iso', '');
          input.value = '';
          overlay.remove();
          if (opts.onChange) opts.onChange('');
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      };
      draw();
      document.getElementById('modal-root').appendChild(overlay);
    };
    input.value = opts.value ? Cal.formatISO(opts.value, lang) : '';
    input.addEventListener('click', show);
    input.addEventListener('focus', show);
  },

  getISO(form, name) {
    const el = form.querySelector('[name="' + name + '"]');
    return el ? (el.getAttribute('data-iso') || '') : '';
  },

  dateField(name, label, value, required) {
    return '<div class="field"><label>' + U.esc(label) + (required ? ' *' : '') + '</label>' +
      '<input type="text" name="' + name + '" id="df-' + name + '" data-iso="' + (value || '') + '" readonly></div>';
  },

  selectField(name, label, options, value, opts) {
    opts = opts || {};
    const optHtml = (opts.empty ? '<option value="">' + U.esc(opts.empty) + '</option>' : '') +
      options.map(o => '<option value="' + U.esc(o.value) + '"' + (String(o.value) === String(value) ? ' selected' : '') + '>' + U.esc(o.label) + '</option>').join('');
    return '<div class="field' + (opts.span2 ? ' span-2' : '') + '"><label>' + U.esc(label) + '</label>' +
      '<select name="' + name + '"' + (opts.multiple ? ' multiple size="5"' : '') + '>' + optHtml + '</select></div>';
  },

  employeeOptions(filterFn) {
    return Employees.active().filter(filterFn || (() => true)).map(e => ({ value: e.id, label: e.fullName + ' (' + e.empNo + ')' }));
  },
  projectOptions() {
    return Projects.visible().map(p => ({ value: p.id, label: p.title }));
  },
  deptOptions() {
    return Store.state.departments.map(d => ({ value: d.id, label: d.name }));
  },
  teamOptions() {
    return Store.state.teams.map(x => ({ value: x.id, label: x.name }));
  },
  statusOptions(kind) {
    return Workflow.statuses(kind).map(s => ({ value: s.id, label: Workflow.statusLabel(kind, s.id) }));
  },
  priorityOptions() {
    return Priorities.list().map(p => ({ value: p.id, label: Priorities.label(p.id) }));
  },

  statusPill(kind, statusId) {
    const s = Workflow.status(kind, statusId);
    if (!s) return '<span class="pill">' + U.esc(statusId) + '</span>';
    const kindCls = { done: 'p-ok', cancelled: 'p-muted', active: 'p-info', open: 'p-muted' }[s.kind] || '';
    return '<span class="pill ' + kindCls + '">' + U.esc(Workflow.statusLabel(kind, statusId)) + '</span>';
  },
  priorityPill(id) {
    const p = Priorities.list().find(x => x.id === id) || {};
    const cls = { critical: 'p-danger', high: 'p-warn', medium: 'p-info', low: 'p-muted' }[id] || 'p-muted';
    return '<span class="pill ' + cls + '">' + U.esc(Priorities.label(id)) + '</span>';
  },
  progressCell(p) {
    const v = U.clamp(U.num(p), 0, 100);
    const cls = v >= 100 ? 'ok' : v >= 50 ? '' : 'warn';
    return '<div class="flex" style="min-width:90px"><div class="progress ' + cls + ' grow"><div style="width:' + v + '%"></div></div><span class="small seq-num">' + v + '%</span></div>';
  },
  userCell(name, sub) {
    return '<div class="user-cell"><span class="avatar">' + U.esc(UI.initials(name)) + '</span><div class="meta"><div>' + U.esc(name) + '</div>' +
      (sub ? '<div class="sub">' + U.esc(sub) + '</div>' : '') + '</div></div>';
  },
  pagination(total, page, perPage, onPage) {
    const pages = Math.max(1, Math.ceil(total / perPage));
    if (pages <= 1) return '';
    let html = '<div class="flex gap mt-1" style="justify-content:center">';
    for (let i = 1; i <= pages; i++) {
      if (pages > 9 && i > 2 && i < pages - 1 && Math.abs(i - page) > 1) {
        if (i === 3 && page > 4 || i === pages - 2 && page < pages - 3) html += '<span class="muted">…</span>';
        continue;
      }
      html += '<button class="btn btn-sm ' + (i === page ? 'btn-primary' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '</div>';
    setTimeout(() => {
      document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => onPage(+b.dataset.page)));
    }, 0);
    return html;
  },
  tagsInput(name, value) {
    return '<input type="text" name="' + name + '" value="' + U.esc((value || []).join(', ')) + '" placeholder="' + t('tags') + '">';
  },
  parseTags(v) {
    return String(v || '').split(/[,،]/).map(x => x.trim()).filter(Boolean);
  }
};
