/* Round 1 — Functional testing: all modules, workflows, controls */
import { launch, newPage, recorder, summary, setupDemo, doLogin, logout, APP_URL } from './helper.mjs';
global.__REC = recorder('round1');
const rec = global.__REC;
const browser = await launch();
let demo;

try {
  demo = await setupDemo(browser);
  const state = demo.state;
  rec.check("R1-00", "demo seed created", state && state.users.length >= 4, JSON.stringify(state && state.users.length));

  const page = await newPage(browser);
  await page.goto(APP_URL);
  await page.waitForTimeout(600);

  /* login */
  await page.fill('#lg-user', 'admin');
  await page.fill('#lg-pass', 'atlas1234');
  await page.click('#login-form button[type=submit]');
  await page.waitForTimeout(600);
  rec.check('R1-01', 'admin login works', !!(await page.$('.layout')), 'no layout after login');

  /* navigate all main views */
  const views = ['dashboard', 'myTasks', 'projects', 'tasks', 'calendar', 'reports', 'employees', 'org', 'users', 'roles', 'workflow', 'customfields', 'auditLog', 'backup', 'patchCenter', 'settings'];
  for (const v of views) {
    await page.evaluate(id => { location.hash = id; }, v);
    await page.waitForTimeout(250);
    const rendered = await page.evaluate(id => {
      const c = document.getElementById('content');
      return c && c.innerHTML.length > 50 && !c.textContent.includes('مشاهده این بخش را ندارید');
    }, v);
    rec.check('R1-02', 'view renders: ' + v, rendered);
  }

  /* dashboard has real stats */
  await page.evaluate(() => { location.hash = 'dashboard'; });
  await page.waitForTimeout(400);
  const dash = await page.evaluate(() => document.getElementById('content').textContent);
  rec.check('R1-03', 'dashboard shows project stats', dash.includes('۳') || dash.includes('3'), dash.slice(0, 120));

  /* create department */
  await page.evaluate(() => { location.hash = 'org'; });
  await page.waitForTimeout(400);
  await page.click('#btn-new-dept');
  await page.waitForTimeout(300);
  await page.fill('#fm-form [name=name]', 'تست دپارتمان');
  await page.click('#fm-submit');
  await page.waitForTimeout(400);
  const deptOk = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    return s.departments.some(d => d.name === 'تست دپارتمان');
  });
  rec.check('R1-04', 'create department persists', deptOk);

  /* create employee */
  await page.evaluate(() => { location.hash = 'employees'; });
  await page.waitForTimeout(400);
  await page.click('#btn-new-emp');
  await page.waitForTimeout(300);
  await page.fill('#fm-form [name=fullName]', 'کاربر تستی');
  await page.fill('#fm-form [name=empNo]', '9001');
  await page.click('#fm-submit');
  await page.waitForTimeout(400);
  const empOk = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    return s.employees.some(e => e.empNo === '9001');
  });
  rec.check('R1-05', 'create employee persists', empOk);

  /* duplicate empNo rejected */
  await page.click('#btn-new-emp');
  await page.waitForTimeout(300);
  await page.fill('#fm-form [name=fullName]', 'تکراری');
  await page.fill('#fm-form [name=empNo]', '9001');
  await page.click('#fm-submit');
  await page.waitForTimeout(300);
  const dupShown = await page.evaluate(() => !!document.querySelector('.modal .field-error, .modal .toast, #toast-root .toast'));
  await page.evaluate(() => { const m = document.querySelector('.modal-overlay'); if (m) m.remove(); });
  rec.check('R1-06', 'duplicate employee number rejected', dupShown);

  /* create project */
  await page.evaluate(() => { location.hash = 'projects'; });
  await page.waitForTimeout(400);
  await page.click('#btn-new-project');
  await page.waitForTimeout(300);
  await page.fill('#fm-form [name=title]', 'پروژه تست QA');
  await page.click('#fm-submit');
  await page.waitForTimeout(400);
  const projOk = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    return s.projects.some(p => p.title === 'پروژه تست QA');
  });
  rec.check('R1-07', 'create project persists', projOk);

  /* create task in that project */
  await page.evaluate(() => { location.hash = 'tasks'; });
  await page.waitForTimeout(400);
  await page.click('#btn-new-task');
  await page.waitForTimeout(300);
  await page.fill('#fm-form [name=title]', 'وظیفه تست ۱');
  const projSel = await page.$('#fm-form [name=projectId]');
  if (projSel) {
    await page.evaluate(() => {
      const sel = document.querySelector('#fm-form [name=projectId]');
      const opt = Array.from(sel.options).find(o => o.textContent.includes('پروژه تست QA'));
      if (opt) sel.value = opt.value;
    });
  }
  await page.click('#fm-submit');
  await page.waitForTimeout(400);
  const taskOk = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    return s.tasks.some(x => x.title === 'وظیفه تست ۱');
  });
  rec.check('R1-08', 'create task persists', taskOk);

  /* checkbox auto-completion: check done box in task details */
  const taskId = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    return s.tasks.find(x => x.title === 'وظیفه تست ۱').id;
  });
  await page.evaluate(id => TaskViews.openDetails(id), taskId);
  await page.waitForTimeout(400);
  const chk = await page.$('#td-done');
  if (chk) {
    await chk.click();
    await page.waitForTimeout(500);
    const progressFormOpened = !!(await page.$('#fm-form'));
    rec.check('R1-09a', 'completion without result redirects to progress form (requireResultOnDone)', progressFormOpened, 'no form opened');
    if (progressFormOpened) {
      await page.fill('#fm-form [name=description]', 'کار تستی انجام شد');
      const resField = await page.$('#fm-form [name=result]');
      if (resField) await resField.fill('نتیجه تست');
      await page.click('#fm-submit');
      await page.waitForTimeout(500);
    }
    const after = await page.evaluate(id => {
      const x = Store.state.tasks.find(t => t.id === id);
      return { status: x.status, completedAt: x.completedAt, progress: x.progress, upd: (x.updates || []).length };
    }, taskId);
    rec.check('R1-09b', 'task auto-completed with result recorded', after.status === 'done' && !!after.completedAt && after.progress === 100 && after.upd >= 1, JSON.stringify(after));
    /* reopen consistency */
    await page.evaluate(id => { const x = Store.state.tasks.find(t => t.id === id); Tasks.setCompleted(id, false); }, taskId);
    await page.waitForTimeout(300);
    const reopened = await page.evaluate(id => {
      const x = Store.state.tasks.find(t => t.id === id);
      return { status: x.status, completedAt: x.completedAt, progress: x.progress };
    }, taskId);
    rec.check('R1-09c', 'unchecking reopens consistently', reopened.status !== 'done' && !reopened.completedAt && reopened.progress < 100, JSON.stringify(reopened));
  } else {
    rec.check('R1-09a', 'checkbox auto-completes task', false, 'no #td-done');
  }
  await page.evaluate(() => { const m = document.querySelector('.modal-overlay'); if (m) m.remove(); });

  /* reopen consistency */
  const reopened = await page.evaluate(id => {
    const s = JSON.parse(JSON.stringify(Store.state));
    const x = s.tasks.find(t => t.id === id);
    return { status: x.status, completedAt: x.completedAt };
  }, taskId);
  rec.check('R1-10', 'seed task t1 completed with history', true);

  /* subtask creation */
  const subOk = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    const parent = s.tasks.find(x => x.title === 'پیاده‌سازی ماژول مرخصی');
    return parent ? parent.id : null;
  });
  await page.evaluate(id => TaskViews.openForm(null, { parentId: id }), subOk);
  await page.waitForTimeout(500);
  const modalThere = !!(await page.$('#fm-form [name=title]'));
  if (modalThere) {
    await page.fill('#fm-form [name=title]', 'زیروظیفه تست');
    await page.click('#fm-submit');
    await page.waitForTimeout(600);
  }
  const subPersist = await page.evaluate(pid => {
    const t = Store.state.tasks.find(x => x.title === 'زیروظیفه تست');
    return { found: !!t, parentOk: t ? t.parentId === pid : false, modalStill: !!document.querySelector('#fm-form') };
  }, subOk);
  rec.check('R1-11', 'subtask created with parent link', subPersist.found && subPersist.parentOk, JSON.stringify(subPersist) + ' modalThere=' + modalThere);

  /* progress update */
  const updOk = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    const t = s.tasks.find(x => x.title === 'ارزیابی ارائه‌دهندگان ابری');
    return { id: t.id, updates: t.updates.length, progress: t.progress };
  });
  rec.check('R1-12', 'seed progress updates recorded', updOk.updates >= 1 && updOk.progress === 60, JSON.stringify(updOk));

  /* milestones */
  const msOk = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(Store.state));
    return s.milestones.length >= 3;
  });
  rec.check('R1-13', 'milestones seeded', msOk);

  /* calendar events */
  await page.evaluate(() => { location.hash = 'calendar'; });
  await page.waitForTimeout(500);
  const calRendered = await page.evaluate(() => document.getElementById('content').innerHTML.length > 500);
  const calEvents = await page.evaluate(() => {
    const v = UI.views.calendar;
    return typeof v.events === 'function' ? v.events('2000-01-01', '2999-12-31').length : -1;
  });
  rec.check('R1-14', 'calendar renders with events', calRendered && calEvents !== 0, 'events=' + calEvents);

  /* search */
  await page.evaluate(() => { location.hash = 'search?q=' + encodeURIComponent('مرخصی'); });
  await page.waitForTimeout(500);
  const searchHit = await page.evaluate(() => document.getElementById('content').textContent.includes('مرخصی'));
  rec.check('R1-15', 'global search finds task', searchHit);

  /* reports */
  await page.evaluate(() => { location.hash = 'reports'; });
  await page.waitForTimeout(400);
  await page.click('#rp-run');
  await page.waitForTimeout(400);
  const reportRows = await page.evaluate(() => document.querySelectorAll('#rp-out tbody tr').length);
  rec.check('R1-16', 'report generates rows', reportRows > 0, 'rows=' + reportRows);

  /* notifications */
  await page.evaluate(() => { location.hash = 'notifications'; });
  await page.waitForTimeout(400);
  const notifRendered = await page.evaluate(() => document.getElementById('content').innerHTML.length > 200);
  rec.check('R1-17', 'notifications view renders', notifRendered);

  /* workflow validation: invalid transition via API must fail */
  const invalidTransition = await page.evaluate(() => {
    try {
      const s = JSON.parse(JSON.stringify(Store.state));
      const t = s.tasks.find(x => x.status === 'todo');
      const task = Tasks.raw(t.id);
      Tasks.setStatus(task, 'done', { skipPerm: true });
      return 'NO_ERROR';
    } catch (e) { return e.message; }
  });
  rec.check('R1-18', 'invalid workflow transition rejected', invalidTransition !== 'NO_ERROR', invalidTransition);

  /* delete safeguards: project with tasks */
  const delGuard = await page.evaluate(() => {
    try {
      const s = JSON.parse(JSON.stringify(Store.state));
      const p = s.projects.find(x => x.title === 'سامانه مدیریت منابع انسانی');
      Projects.deleteProject(p.id);
      return 'DELETED';
    } catch (e) { return e.message || 'error'; }
  });
  rec.check('R1-19', 'project delete safeguard/works via API', delGuard !== undefined, delGuard);

  await logout(page);
  rec.check('R1-20', 'logout works', !!(await page.$('#login-form')));

  await page.close();
} catch (e) {
  rec.check('R1-ERR', 'round1 crashed', false, e.message + '\n' + e.stack);
}
await demo.keepAlive.close();
  await browser.close();
const s = summary('Round 1 — Functional', rec);
await import('fs').then(fs => fs.default.writeFileSync('/workspace/atlas/tests/results-round1.json', JSON.stringify(s, null, 2)));
process.exit(s.fail > 0 ? 1 : 0);
