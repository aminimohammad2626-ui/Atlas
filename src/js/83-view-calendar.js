/* ===== View: Calendar (month / week / day) ===== */
UI.registerView({
  id: 'calendar',
  module: 'calendar',
  title: () => t('calendar'),
  render() {
    const lang = I18N.getLang();
    const sys = Cal.systemFor(lang);
    const today = Cal.isoToParts(Cal.todayISO(), sys);
    this.st = { sys, y: today.y, m: today.m, day: today.d, mode: 'month', filter: '' };
    return '<div class="filter-bar">' +
      '<button class="btn btn-sm" id="cal-prev">‹</button>' +
      '<button class="btn btn-sm" id="cal-today">' + t('today') + '</button>' +
      '<button class="btn btn-sm" id="cal-next">›</button>' +
      '<span class="pill" id="cal-title"></span>' +
      '<span class="grow"></span>' +
      '<button class="btn btn-sm" data-mode="month">' + t('monthView') + '</button>' +
      '<button class="btn btn-sm" data-mode="week">' + t('weekView') + '</button>' +
      '<button class="btn btn-sm" data-mode="day">' + t('dayView') + '</button>' +
      '<div class="field" style="max-width:180px"><select id="cal-filter"><option value="">' + t('filterEvents') + '</option>' +
      '<option value="taskDue">' + t('calendar_taskDue') + '</option>' +
      '<option value="taskStart">' + t('calendar_taskStart') + '</option>' +
      '<option value="milestone">' + t('calendar_milestone') + '</option>' +
      '<option value="projectEnd">' + t('calendar_projectEnd') + '</option></select></div>' +
      '</div><div id="cal-body"></div>';
  },
  bind() {
    const rerender = () => this.renderBody();
    document.getElementById('cal-prev').addEventListener('click', () => this.nav(-1));
    document.getElementById('cal-next').addEventListener('click', () => this.nav(1));
    document.getElementById('cal-today').addEventListener('click', () => {
      const p = Cal.isoToParts(Cal.todayISO(), this.st.sys);
      this.st.y = p.y; this.st.m = p.m; this.st.day = p.d; rerender();
    });
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      this.st.mode = b.dataset.mode; rerender();
    }));
    document.getElementById('cal-filter').addEventListener('change', e => { this.st.filter = e.target.value; rerender(); });
    rerender();
  },
  nav(dir) {
    const st = this.st;
    if (st.mode === 'month') {
      const nm = Cal.addMonths(st.y, st.m, dir, st.sys);
      st.y = nm.y; st.m = nm.m;
    } else if (st.mode === 'week') {
      const iso = this.selISO();
      const target = Cal.addDays(iso, dir * 7);
      const p = Cal.isoToParts(target, st.sys);
      st.y = p.y; st.m = p.m; st.day = p.d;
    } else {
      const target = Cal.addDays(this.selISO(), dir);
      const p = Cal.isoToParts(target, st.sys);
      st.y = p.y; st.m = p.m; st.day = p.d;
    }
    this.renderBody();
  },
  selISO() {
    return Cal.partsToISO(this.st.y, this.st.m, this.st.day, this.st.sys);
  },
  events(rangeFrom, rangeTo) {
    const st = this.st;
    const evts = [];
    const tasks = Perms.visible('tasks', Store.state.tasks.filter(x => !x.archived));
    tasks.forEach(x => {
      if (x.dueDate) evts.push({ iso: x.dueDate, type: 'taskDue', ref: x, label: '⏰ ' + x.title });
      if (x.startDate) evts.push({ iso: x.startDate, type: 'taskStart', ref: x, label: '▶ ' + x.title });
    });
    const projects = Projects.visible();
    projects.forEach(p => {
      if (p.endDate) evts.push({ iso: p.endDate, type: 'projectEnd', ref: p, label: '🏁 ' + p.title });
      Projects.projectMilestones(p.id).forEach(m => {
        if (m.dueDate) evts.push({ iso: m.dueDate, type: 'milestone', ref: { p, m }, label: '◆ ' + m.title });
      });
    });
    return evts.filter(e => (!st.filter || e.type === st.filter) && e.iso >= rangeFrom && e.iso <= rangeTo);
  },
  renderBody() {
    const st = this.st;
    const el = document.getElementById('cal-body');
    const title = document.getElementById('cal-title');
    const monthName = Cal.monthName(st.m, st.sys);
    if (st.mode === 'month') {
      title.textContent = monthName + ' ' + st.y;
      const grid = Cal.monthGridStart(st.y, st.m, st.sys, Store.state.settings.weekStart);
      const startISO = Cal.addDays(grid.firstISO, -grid.startIdx);
      const endISO = Cal.addDays(startISO, 41);
      const evts = this.events(startISO, endISO);
      const wds = st.sys === 'jalali' ? Cal.FA_WEEKDAYS_SHORT : Cal.EN_WEEKDAYS_SHORT;
      let html = '<div class="card" style="padding:10px"><div class="cal-grid">';
      html += wds.map(w => '<div class="cal-wd">' + w + '</div>').join('');
      for (let i = 0; i < 42; i++) {
        const iso = Cal.addDays(startISO, i);
        const p = Cal.isoToParts(iso, st.sys);
        const inMonth = p.m === st.m && p.y === st.y;
        const dayEvts = evts.filter(e => e.iso === iso);
        html += '<div class="cal-cell' + (inMonth ? '' : ' cal-out') + (iso === Cal.todayISO() ? ' cal-today' : '') + '" data-date="' + iso + '">' +
          '<div class="cal-daynum seq-num">' + p.d + '</div>' +
          dayEvts.slice(0, 3).map(e => '<div class="cal-ev cal-' + e.type + '" data-evt="' + e.type + '" data-ref="' + (e.ref.id || '') + '" title="' + U.esc(e.label) + '">' + U.esc(U.truncate(e.label, 22)) + '</div>').join('') +
          (dayEvts.length > 3 ? '<button class="cal-more" data-date="' + iso + '">+' + (dayEvts.length - 3) + ' ' + t('more') + '</button>' : '') +
          '</div>';
      }
      html += '</div></div>';
      el.innerHTML = html;
      this.bindEvents(el);
      return;
    }
    if (st.mode === 'week') {
      const sel = this.selISO();
      const idx = Cal.weekdayIndexSat(sel);
      const weekStart = Cal.addDays(sel, -(idx - Store.state.settings.weekStart + 7) % 7);
      const endISO = Cal.addDays(weekStart, 6);
      title.textContent = Cal.formatISO(weekStart, I18N.getLang(), { medium: true }) + ' — ' + Cal.formatISO(endISO, I18N.getLang(), { medium: true });
      const evts = this.events(weekStart, endISO);
      let html = '<div class="card" style="padding:10px"><div class="cal-week">';
      for (let i = 0; i < 7; i++) {
        const iso = Cal.addDays(weekStart, i);
        const dayEvts = evts.filter(e => e.iso === iso);
        html += '<div class="cal-wk-col' + (iso === Cal.todayISO() ? ' cal-today' : '') + '"><div class="cal-wk-head">' + Cal.weekdayName(iso, I18N.getLang()) + '<div class="seq-num">' + Cal.isoToParts(iso, st.sys).d + '</div></div>' +
          dayEvts.map(e => '<div class="cal-ev cal-' + e.type + '" data-evt="' + e.type + '" data-ref="' + (e.ref.id || '') + '">' + U.esc(e.label) + '</div>').join('') + '</div>';
      }
      el.innerHTML = html + '</div></div>';
      this.bindEvents(el);
      return;
    }
    const iso = this.selISO();
    title.textContent = Cal.formatISO(iso, I18N.getLang(), { long: true });
    const dayEvts = this.events(iso, iso);
    el.innerHTML = '<div class="card">' + (dayEvts.length ?
      '<ul class="timeline">' + dayEvts.map(e => '<li><div class="tl-head"><span class="cal-ev cal-' + e.type + '">' + U.esc(e.label) + '</span>' +
        '<button class="btn btn-sm" data-evt="' + e.type + '" data-ref="' + (e.ref.id || '') + '">' + t('goToRecord') + '</button></div></li>').join('') + '</ul>'
      : '<div class="empty-state">' + t('noData') + '</div>') + '</div>';
    this.bindEvents(el);
  },
  bindEvents(el) {
    el.querySelectorAll('.cal-more').forEach(b => b.addEventListener('click', () => {
      const iso = b.dataset.date;
      const evts = this.events(iso, iso);
      UI.modal({
        title: t('events') + ' — ' + Cal.formatISO(iso, I18N.getLang()),
        body: '<ul class="timeline">' + evts.map(e => '<li><div class="tl-head"><span class="cal-ev cal-' + e.type + '">' + U.esc(e.label) + '</span>' +
          '<button class="btn btn-sm" data-evt="' + e.type + '" data-ref="' + (e.ref.id || '') + '">' + t('goToRecord') + '</button></div></li>').join('') + '</ul>'
      });
      this.bindGoButtons(document.getElementById('modal-root'));
    }));
    this.bindGoButtons(el);
  },
  bindGoButtons(root) {
    root.querySelectorAll('[data-evt]').forEach(elm => {
      if (elm.classList.contains('cal-ev') && !elm.classList.contains('clickable')) return;
      elm.addEventListener('click', e => {
        e.stopPropagation();
        const type = elm.dataset.evt, ref = elm.dataset.ref;
        if (!ref) return;
        if (type === 'milestone') {
          const ms = U.byId(Store.state.milestones, ref);
          if (ms) UI.nav('projectDetail', { id: ms.projectId });
        } else if (type === 'projectEnd') {
          UI.nav('projectDetail', { id: ref });
        } else {
          TaskViews.openDetails(ref);
        }
      });
    });
  }
});
