/* Round 5 — Integration, Patch Center, Regression, Stress */
import { launch, recorder, summary, newPage, setupDemo, doLogin, APP_URL } from './helper.mjs';
import fs from 'fs';

const rec = recorder('round5');
global.__REC = rec;

const browser = await launch();
const TIMINGS = {};
try {
  /* ---------- setup demo instance ---------- */
  const demo = await setupDemo(browser);
  const page = demo.keepAlive;
  await page.goto(APP_URL);
  await page.waitForTimeout(400);
  await doLogin(page, 'admin', 'atlas1234');
  await page.waitForTimeout(500);

  /* ---------- R5-01/02: UI-driven patch installation ---------- */
  await page.evaluate(() => UI.nav('patchCenter'));
  await page.waitForTimeout(400);
  const inputHandle = await page.$('input[type=file][accept=".json,application/json"]');
  rec.check('R5-01a', 'patch center file input present', !!inputHandle);
  await inputHandle.setInputFiles('/workspace/atlas/dist/Atlas-patch1.json');
  await page.waitForTimeout(600);
  const inspect = await page.evaluate(() => ({
    hasInstall: !!document.getElementById('pc-install'),
    pills: document.getElementById('pc-inspect').innerText
  }));
  rec.check('R5-01b', 'patch1 passes validation, integrity, trust, compatibility',
    inspect.hasInstall && inspect.pills.includes('OK'), inspect.pills.slice(0, 200));
  if (inspect.hasInstall) {
    await page.click('#pc-install');
    await page.waitForTimeout(800);
  }
  const postInstall = await page.evaluate(() => ({
    schema: Store.state.meta.schemaVersion,
    history: Store.state.patchHistory.map(h => ({ id: h.id, result: h.result, schemaAfter: h.schemaAfter })),
    installed: Store.state.meta.installedPatches,
    migHist: Store.state.meta.migrationHistory || [],
    annCollection: Array.isArray(Store.state.announcements),
    moduleReg: Perms.MODULES.some(m => m.id === 'announcements')
  }));
  rec.check('R5-02', 'patch install: schema->2, migration + install history, announcements collection & module',
    postInstall.schema === 2 && postInstall.annCollection && postInstall.moduleReg &&
    postInstall.history.some(h => h.id === 'atlas-announcements' && h.result === 'installed' && h.schemaAfter === 2) &&
    postInstall.installed.some(p => p.id === 'atlas-announcements' && p.active) &&
    postInstall.migHist.length > 0,
    JSON.stringify(postInstall));

  /* ---------- R5-03: announcements CRUD via UI ---------- */
  await page.evaluate(() => UI.nav('announcements'));
  await page.waitForTimeout(400);
  await page.click('#ann-new');
  await page.waitForTimeout(300);
  await page.fill('.modal input[name="title"]', 'اطلاعیه تست یکپارچگی');
  await page.fill('.modal textarea[name="body"]', 'بدنه اطلاعیه برای تست نصب پچ.');
  await page.click('#fm-submit');
  await page.waitForTimeout(500);
  const annState = await page.evaluate(() => ({
    count: Store.state.announcements.length,
    published: Store.state.announcements.filter(a => a.publishedAt).length,
    shown: document.body.innerText.includes('اطلاعیه تست یکپارچگی')
  }));
  rec.check('R5-03', 'announcement created + published via UI, visible in list',
    annState.count === 1 && annState.published === 1 && annState.shown, JSON.stringify(annState));

  /* ---------- R5-04: deactivate / reactivate ---------- */
  await page.evaluate(() => UI.nav('patchCenter'));
  await page.waitForTimeout(400);
  await page.click('[data-deact="atlas-announcements"]');
  await page.waitForTimeout(500);
  const deact = await page.evaluate(() => ({
    payloadInactive: Store.state.activePatchPayloads['atlas-announcements'] && Store.state.activePatchPayloads['atlas-announcements'].active === false,
    stillInstalled: (Store.state.meta.installedPatches.find(p => p.id === 'atlas-announcements') || {}).active === false
  }));
  await page.click('[data-react="atlas-announcements"]');
  await page.waitForTimeout(500);
  const react = await page.evaluate(() => ({
    payloadBack: !!Store.state.activePatchPayloads['atlas-announcements'] && Store.state.activePatchPayloads['atlas-announcements'].active !== false,
    active: (Store.state.meta.installedPatches.find(p => p.id === 'atlas-announcements') || {}).active === true,
    annView: (() => { try { UI.nav('announcements'); return document.body.innerText.length > 100; } catch (e) { return false; } })()
  }));
  rec.check('R5-04', 'patch deactivate removes payload; reactivate restores it',
    deact.payloadInactive && deact.stillInstalled && react.payloadBack && react.active && react.annView,
    JSON.stringify({ deact, react }));

  /* ---------- R5-05: rollback ---------- */
  const rb = await page.evaluate(() => {
    try { PatchCenter.rollback('atlas-announcements'); } catch (e) { return { err: e.message }; }
    return {
      rec: Store.state.patchHistory.filter(h => h.id === 'atlas-announcements').pop(),
      payloadGone: !Store.state.activePatchPayloads['atlas-announcements'],
      uninstalled: !(Store.state.meta.installedPatches || []).some(p => p.id === 'atlas-announcements')
    };
  });
  rec.check('R5-05', 'patch rollback: history marked rolledBack, payload removed',
    rb.rec && rb.rec.result === 'rolledBack' && rb.payloadGone && rb.uninstalled, JSON.stringify(rb));

  /* ---------- R5-06: reinstall for backup tests ---------- */
  await page.evaluate(() => UI.nav('patchCenter'));
  await page.waitForTimeout(300);
  const inputHandle2 = await page.$('input[type=file][accept=".json,application/json"]');
  await inputHandle2.setInputFiles('/workspace/atlas/dist/Atlas-patch1.json');
  await page.waitForTimeout(500);
  if (await page.$('#pc-install')) {
    await page.click('#pc-install');
    await page.waitForTimeout(700);
  }
  const reinstalled = await page.evaluate(() => !!Store.state.activePatchPayloads['atlas-announcements']);
  rec.check('R5-06', 'patch reinstall after rollback succeeds', reinstalled);

  /* ---------- R5-07/08/09: invalid patches rejected ---------- */
  const pkgGood = JSON.parse(fs.readFileSync('/workspace/atlas/dist/Atlas-patch1.json', 'utf8'));
  const tampered = JSON.parse(JSON.stringify(pkgGood));
  tampered.payload.js = tampered.payload.js + '\n/* tampered */';
  const incompat = JSON.parse(JSON.stringify(pkgGood));
  incompat.id = 'atlas-future'; incompat.minAppVersion = '99.0.0';
  const rej = await page.evaluate(pkgs => ({
    tampered: PatchCenter.validate(pkgs.tampered),
    incompat: { v: PatchCenter.validate(pkgs.incompat).ok, c: PatchCenter.compat(pkgs.incompat) },
    malformed: PatchCenter.validate(null),
    notFormat: PatchCenter.validate({ id: 'x' })
  }), { tampered, incompat });
  rec.check('R5-07', 'tampered patch rejected (integrity hash mismatch)', !rej.tampered.ok, JSON.stringify(rej.tampered));
  rec.check('R5-08', 'incompatible patch rejected (minAppVersion 99.0.0)', !rej.incompat.c.ok, JSON.stringify(rej.incompat));
  rec.check('R5-09', 'malformed / non-atlas packages rejected', !rej.malformed.ok && !rej.notFormat.ok, JSON.stringify(rej));

  /* ---------- R5-10: backup post-patch ---------- */
  const backup = await page.evaluate(() => Backup.create());
  const bkCheck = await page.evaluate(b => ({
    val: Backup.validate(b).ok,
    schema: b.schemaVersion,
    hasAnn: Array.isArray(b.data.announcements),
    inv: b.inventory ? Object.keys(b.inventory).length : 0
  }), backup);
  rec.check('R5-10', 'backup post-patch: valid, schema 2, announcements included',
    bkCheck.val && bkCheck.schema === 2 && bkCheck.hasAnn, JSON.stringify({ schema: bkCheck.schema, hasAnn: bkCheck.hasAnn, inv: bkCheck.inv }));

  /* ---------- R5-11: restore into clean instance ---------- */
  const backupJson = JSON.stringify(backup);
  {
    const b2 = await launch();
    try {
      const p2 = await newPage(b2, { viewport: { width: 1280, height: 800 } });
      await p2.goto(APP_URL);
      await p2.waitForTimeout(600);
      await p2.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      await p2.reload();
      await p2.waitForTimeout(700);
      const res = await p2.evaluate(bj => {
        try {
          const r = Backup.restore(JSON.parse(bj));
          return { ok: true, schema: Store.state.meta.schemaVersion,
            ann: (Store.state.announcements || []).length,
            patchPayload: !!Store.state.activePatchPayloads['atlas-announcements'],
            users: Store.state.users.length };
        } catch (e) { return { ok: false, err: e.message }; }
      }, backupJson);
      await p2.reload();
      await p2.waitForTimeout(700);
      const loginOk = await doLogin(p2, 'admin', 'atlas1234');
      const annVisible = await p2.evaluate(() => { try { UI.nav('announcements'); return document.body.innerText.includes('اطلاعیه'); } catch (e) { return false; } });
      rec.check('R5-11', 'restore patched backup into clean instance: data + patch payload + schema preserved, login works',
        res.ok && res.schema === 2 && res.ann === 1 && res.patchPayload && loginOk && annVisible, JSON.stringify({ res, loginOk, annVisible }));
      await p2.goto('about:blank');
      await b2.close();
    } catch (e) { rec.check('R5-11', 'restore into clean instance', false, e.message); }
  }

  /* ---------- R5-12: FA Jalali datepicker regression (year clamp fix) ---------- */
  const faPick = await page.evaluate(async (expectedISO) => {
    Store.state.settings.language = 'fa'; I18N.setLang('fa'); UI.render();
    const holder = document.createElement('div');
    holder.innerHTML = Widgets.dateField('rd', 'x');
    document.body.appendChild(holder);
    Widgets.datepicker('df-rd', { value: '' });
    const input = document.getElementById('df-rd');
    input.click();
    await new Promise(r => setTimeout(r, 100));
    const ov = [...document.querySelectorAll('.modal-overlay')].pop();
    const yIn = ov.querySelector('#dp-year');
    yIn.value = '1404'; yIn.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 100));
    const btn = ov.querySelector('.dp-day[data-iso="' + expectedISO + '"]');
    if (!btn) { holder.remove(); return { ok: false, why: 'cell missing' }; }
    btn.click();
    const out = { ok: input.getAttribute('data-iso') === expectedISO, val: input.value, iso: input.getAttribute('data-iso') };
    holder.remove();
    document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
    return out;
  }, '2025-11-06');
  rec.check('R5-12', 'FA Jalali datepicker: year 1404 entry -> correct Gregorian ISO (regression)',
    faPick.ok, JSON.stringify(faPick));

  /* ---------- R5-13: core regression post-patch ---------- */
  const core = await page.evaluate(() => {
    const out = {};
    try {
      Store.state.settings.language = 'fa'; I18N.setLang('fa');
      const proj = Store.state.projects.find(p => !p.archived) || Store.state.projects[0];
      const emp = Store.state.employees[0];
      const task = Tasks.create({ title: 'وظیفه رگرسیون', projectId: proj.id, assigneeIds: [emp.id], priority: 'high' });
      out.created = !!task.id;
      task.resultSummary = 'نتیجه تست';
      Tasks.setCompleted(task.id, true);
      const t2 = U.byId(Store.state.tasks, task.id);
      out.completedStatus = t2.status === Tasks.doneStatusId();
      out.completedAt = !!t2.completedAt;
      out.progress = t2.progress === 100;
      out.completionHistory = (t2.history || []).some(h => h.action === 'complete');
      Tasks.reopen(t2);
      const t3 = U.byId(Store.state.tasks, task.id);
      out.reopened = t3.status !== Tasks.doneStatusId() && t3.progress < 100;
      Tasks.addProgressUpdate(task.id, { description: 'گزارش تست', progress: 50 });
      const t4 = U.byId(Store.state.tasks, task.id);
      out.progressUpdate = t4.progress === 50 && t4.updates.length >= 1;
    } catch (e) { out.err = e.message; }
    return out;
  });
  rec.check('R5-13', 'core task flows (complete/reopen/progress) work post-patch',
    core.created && core.completedStatus && core.completedAt && core.progress && core.completionHistory && core.reopened && core.progressUpdate,
    JSON.stringify(core));

  /* ---------- R5-14: language switch post-patch ---------- */
  const langSw = await page.evaluate(() => {
    const before = Store.state.tasks.length + '|' + Store.state.announcements.length;
    Store.state.settings.language = 'en'; I18N.setLang('en'); UI.render();
    const enOk = document.documentElement.dir === 'ltr' && document.body.innerText.length > 100;
    Store.state.settings.language = 'fa'; I18N.setLang('fa'); UI.render();
    const after = Store.state.tasks.length + '|' + Store.state.announcements.length;
    return { enOk, unchanged: before === after, annFa: (() => { UI.nav('announcements'); return document.body.innerText.includes('اطلاعیه'); })() };
  });
  rec.check('R5-14', 'language switch + localization works post-patch (announcements in FA)',
    langSw.enOk && langSw.unchanged && langSw.annFa, JSON.stringify(langSw));

  /* ---------- stress: 2000 tasks ---------- */
  const stress = await page.evaluate(() => {
    const out = {};
    let t0 = Date.now();
    const projs = [];
    for (let i = 0; i < 50; i++) {
      projs.push(Projects.create({ title: 'پروژه حجم ' + (i + 1), description: '', priority: 'medium' }));
    }
    out.createProjects = Date.now() - t0;
    const emps = Store.state.employees.map(e => e.id);
    t0 = Date.now();
    for (let i = 0; i < 2000; i++) {
      Tasks.create({
        title: 'وظیفه بزرگ ' + (i + 1),
        projectId: projs[i % projs.length].id,
        assigneeIds: [emps[i % emps.length]],
        priority: ['low', 'medium', 'high'][i % 3],
        dueDate: Cal.addDays(Cal.todayISO(), (i % 90) - 30)
      });
    }
    out.createTasks = Date.now() - t0;
    out.taskCount = Store.state.tasks.length;
    t0 = Date.now();
    UI.nav('tasks');
    out.renderTasks = Date.now() - t0;
    t0 = Date.now();
    const sr = Search.run('بزرگ 123');
    out.search = Date.now() - t0;
    out.searchHits = (sr.tasks || sr || []).length;
    t0 = Date.now();
    Reports.run('overdue-tasks', {});
    out.report = Date.now() - t0;
    t0 = Date.now();
    UI.nav('calendar');
    out.calendar = Date.now() - t0;
    return out;
  });
  TIMINGS.stress = stress;
  rec.check('R5-15', 'stress: 2000 tasks + 50 projects created in < 30s', stress.createTasks < 30000 && stress.taskCount >= 2000,
    JSON.stringify({ createTasks: stress.createTasks + 'ms', count: stress.taskCount }));
  rec.check('R5-16', 'stress: tasks view renders 2000+ tasks < 3s (paginated)', stress.renderTasks < 3000, stress.renderTasks + 'ms');
  rec.check('R5-17', 'stress: search across 2000 tasks < 1s and finds matches', stress.search < 1000 && stress.searchHits > 0,
    stress.search + 'ms hits=' + stress.searchHits);
  rec.check('R5-18', 'stress: report generation < 3s', stress.report < 3000, stress.report + 'ms');
  rec.check('R5-19', 'stress: calendar month render < 3s', stress.calendar < 3000, stress.calendar + 'ms');

  /* ---------- R5-20: embedded portable save with large state ---------- */
  const saveBig = await page.evaluate(() => {
    const t0 = Date.now();
    const html = SaveSys.buildHTML();
    const ms = Date.now() - t0;
    const m = html.match(/<script id="atlas-embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
    let parsed = null, err = null;
    try { parsed = JSON.parse(m[1].replace(/<\\\//g, '</')); } catch (e) { err = e.message; }
    return { ms, sizeKB: Math.round(html.length / 1024), parsedOk: !!parsed && parsed.tasks.length >= 2000, err };
  });
  rec.check('R5-20', 'embedded save with 2000+ tasks: builds < 5s, embedded JSON parses',
    saveBig.ms < 5000 && saveBig.parsedOk, JSON.stringify({ ms: saveBig.ms, sizeKB: saveBig.sizeKB, parsedOk: saveBig.parsedOk, err: saveBig.err }));

  /* ---------- R5-21: large backup + restore round trip ---------- */
  const bigBackup = await page.evaluate(() => {
    const t0 = Date.now();
    const b = Backup.create();
    return { b, ms: Date.now() - t0, sizeKB: Math.round(JSON.stringify(b).length / 1024) };
  });
  const bigBackupOk = await page.evaluate(b => Backup.validate(b).ok, bigBackup.b);
  rec.check('R5-21', 'large backup (2000+ tasks) created & valid < 10s',
    bigBackupOk && bigBackup.ms < 10000, bigBackup.ms + 'ms ' + bigBackup.sizeKB + 'KB');

  {
    const b3 = await launch();
    try {
      const p3 = await newPage(b3, { viewport: { width: 1280, height: 800 } });
      await p3.goto(APP_URL);
      await p3.waitForTimeout(600);
      await p3.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      await p3.reload();
      await p3.waitForTimeout(700);
      const rres = await p3.evaluate(b => {
        const t0 = Date.now();
        try {
          Backup.restore(b);
          return { ok: true, ms: Date.now() - t0, tasks: Store.state.tasks.length, projects: Store.state.projects.length,
            users: Store.state.users.length, schema: Store.state.meta.schemaVersion };
        } catch (e) { return { ok: false, err: e.message }; }
      }, bigBackup.b);
      rec.check('R5-22', 'large backup restore into clean instance: all 2000+ tasks, < 15s',
        rres.ok && rres.tasks >= 2000 && rres.projects >= 50 && rres.ms < 15000, JSON.stringify(rres));
      await p3.goto('about:blank');
      await b3.close();
    } catch (e) { rec.check('R5-22', 'large restore', false, e.message); }
  }

  /* ---------- R5-23: regression — persistence + perms still intact after stress ---------- */
  const reg = await page.evaluate(() => {
    Store.persist();
    const saved = JSON.parse(localStorage.getItem('atlas-state'));
    return {
      persistedTasks: saved.tasks.length,
      hashed: saved.users.every(u => /^[a-f0-9]{64}$/.test(u.passHash) && !!u.salt),
      schema: saved.meta.schemaVersion
    };
  });
  rec.check('R5-23', 'post-stress persistence: state saved, passwords still hashed, schema intact',
    reg.persistedTasks >= 2000 && reg.hashed && reg.schema === 2, JSON.stringify({ tasks: reg.persistedTasks, schema: reg.schema }));

  fs.writeFileSync('/workspace/atlas/tests/results-round5.json',
    JSON.stringify(summary('Round 5 — Integration, Patch, Regression & Stress', rec), null, 1));
  fs.writeFileSync('/workspace/atlas/tests/timings-round5.json', JSON.stringify(TIMINGS, null, 1));
} finally {
  await browser.close();
}
process.exit(rec.results.some(r => !r.ok) || rec.errors.length ? 1 : 0);
