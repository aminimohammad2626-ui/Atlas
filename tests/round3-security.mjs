/* Round 3 — Permissions & security testing */
import { launch, newPage, recorder, summary, setupDemo, doLogin, logout, APP_URL } from './helper.mjs';
import fs from 'fs';
global.__REC = recorder('round3');
const rec = global.__REC;
const browser = await launch();
let demo;

try {
  demo = await setupDemo(browser);
  const page = await newPage(browser);
  await page.goto(APP_URL);
  await page.waitForTimeout(600);
  await doLogin(page, 'admin', 'atlas1234');

  /* --- role change lifecycle (PRD 12.5) --- */
  const lifecycle = await page.evaluate(() => {
    const out = {};
    const empRole = Store.state.roles.find(r => r.key === 'role_emp');
    const pmRole = Store.state.roles.find(r => r.key === 'role_pm');
    const u = Users.create({ username: 'lifecycle.test', displayName: 'Lifecycle', password: 'secret123', roles: [empRole.id] });
    out.step2_empView = Perms.canUser(u, 'projects', 'view');
    out.step2_empCreate = Perms.canUser(u, 'projects', 'create');
    Users.update(u.id, { username: u.username, displayName: u.displayName, roles: [pmRole.id], employeeId: null, status: 'active' });
    const u2 = U.byId(Store.state.users, u.id);
    out.step4_pmCreate = Perms.canUser(u2, 'projects', 'create');
    out.step4_pmDelete = Perms.canUser(u2, 'projects', 'delete');
    Users.update(u.id, { username: u.username, displayName: u.displayName, roles: [empRole.id], employeeId: null, status: 'active' });
    const u3 = U.byId(Store.state.users, u.id);
    out.step6_downgrade = Perms.canUser(u3, 'projects', 'create') === false;
    out.step6_stillViews = Perms.canUser(u3, 'projects', 'view');
    Store.persist();
    return out;
  });
  rec.check('R3-01', 'lifecycle: employee can view but not create', lifecycle.step2_empView === true && lifecycle.step2_empCreate === false, JSON.stringify(lifecycle));
  rec.check('R3-02', 'lifecycle: PM role grants create/delete', lifecycle.step4_pmCreate === true && lifecycle.step4_pmDelete === true);
  rec.check('R3-03', 'lifecycle: downgrade removes elevated perms', lifecycle.step6_downgrade === true && lifecycle.step6_stillViews === true);

  /* reload: persisted role stays correct */
  await page.reload();
  await page.waitForTimeout(700);
  await doLogin(page, 'admin', 'atlas1234');
  const persistedRole = await page.evaluate(() => {
    const u = Store.state.users.find(x => x.username === 'lifecycle.test');
    const role = Store.state.roles.find(r => r.id === (u.roles || [])[0]);
    return { key: role.key, canCreate: Perms.canUser(u, 'projects', 'create') };
  });
  rec.check('R3-04', 'role persists correctly after reload', persistedRole.key === 'role_emp' && persistedRole.canCreate === false, JSON.stringify(persistedRole));

  /* --- last admin safeguard --- */
  const lastAdmin = await page.evaluate(() => {
    const admins = Store.state.users.filter(u => (u.roles || []).includes('role-admin'));
    const target = admins.find(u => u.username === 'admin');
    try { Users.delete(target.id); return 'DELETED'; } catch (e) { return e.message; }
  });
  rec.check('R3-05', 'last admin deletion blocked', lastAdmin !== 'DELETED', lastAdmin);
  const lastAdminDemote = await page.evaluate(() => {
    const admins = Store.state.users.filter(u => (u.roles || []).includes('role-admin'));
    if (admins.length !== 1) return 'skip (multiple admins)';
    const target = admins[0];
    try {
      Users.update(target.id, { username: target.username, displayName: target.displayName, roles: ['role-emp'], employeeId: target.employeeId, status: 'active' });
      return 'DEMOTED';
    } catch (e) { return e.message; }
  });
  rec.check('R3-06', 'last admin demotion blocked', lastAdminDemote !== 'DEMOTED', lastAdminDemote);

  /* --- employee restrictions --- */
  await logout(page);
  await doLogin(page, 'employee', 'atlas1234');
  const empNavs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.nav a[data-nav]')).map(a => a.dataset.nav);
    return links;
  });
  rec.check('R3-07', 'employee nav hides admin views', !empNavs.includes('users') && !empNavs.includes('roles') && !empNavs.includes('backup') && !empNavs.includes('patchCenter') && empNavs.includes('tasks'), JSON.stringify(empNavs));

  const empDirect = await page.evaluate(() => {
    const out = {};
    const tryOp = (name, fn) => { try { fn(); out[name] = 'ALLOWED'; } catch (e) { out[name] = e.code || e.message; } };
    tryOp('createUser', () => Users.create({ username: 'hacker.test', displayName: 'x', password: 'secret123' }));
    tryOp('createProject', () => Projects.create({ title: 'hack' }));
    tryOp('deleteOtherTask', () => {
      const t = Store.state.tasks.find(x => x.title === 'تحلیل نیازمندی‌ها');
      Tasks.delete(t.id);
    });
    tryOp('elevateSelf', () => {
      const me = Auth.currentUser();
      Users.update(me.id, { username: me.username, displayName: me.displayName, roles: ['role-admin'], employeeId: me.employeeId, status: 'active' });
    });
    tryOp('readAudit', () => Perms.assert('audit', 'view'));
    tryOp('installPatch', () => Perms.assert('patch', 'install'));
    return out;
  });
  rec.check('R3-08', 'employee cannot create users via direct API', empDirect.createUser !== 'ALLOWED', JSON.stringify(empDirect));
  rec.check('R3-09', 'employee cannot create projects', empDirect.createProject !== 'ALLOWED');
  rec.check('R3-10', 'employee cannot delete others\' tasks', empDirect.deleteOtherTask !== 'ALLOWED');
  rec.check('R3-11', 'employee cannot self-elevate to admin', empDirect.elevateSelf !== 'ALLOWED');
  rec.check('R3-12', 'employee cannot read audit log or install patches', empDirect.readAudit !== 'ALLOWED' && empDirect.installPatch !== 'ALLOWED');

  /* assigned-scope: employee CAN report progress on own task */
  const empOwnTask = await page.evaluate(() => {
    const me = Auth.currentUser();
    const t = Store.state.tasks.find(x => (x.assigneeIds || []).includes(me.employeeId));
    if (!t) return 'no-task';
    try { Tasks.addProgressUpdate(t.id, { description: 'گزارش آزمایشی', progress: 55 }); return 'OK'; } catch (e) { return e.code || e.message; }
  });
  rec.check('R3-13', 'employee can report progress on assigned task', empOwnTask === 'OK', empOwnTask);

  /* disabled account cannot login */
  await logout(page);
  await doLogin(page, 'admin', 'atlas1234');
  const disableRes = await page.evaluate(() => {
    const u = Store.state.users.find(x => x.username === 'lifecycle.test');
    Users.setStatus(u.id, 'disabled');
    Store.persist();
    return true;
  });
  await logout(page);
  await page.reload();
  await page.waitForTimeout(600);
  const disabledLogin = await doLogin(page, 'lifecycle.test', 'secret123');
  rec.check('R3-14', 'disabled account cannot login', !disabledLogin || !(await page.$('.layout')));
  await doLogin(page, 'admin', 'atlas1234');
  await page.evaluate(() => {
    const u = Store.state.users.find(x => x.username === 'lifecycle.test');
    Users.setStatus(u.id, 'active');
    Store.persist();
  });
  await logout(page).catch(() => {});

  /* --- simulator matches actual rules --- */
  const simOk = await doLogin(page, 'admin', 'atlas1234');
  const sim = await page.evaluate(() => {
    const u = Store.state.users.find(x => x.username === 'pm.user');
    const simEff = Perms.simulateUser(u.id);
    const realEff = Perms.effective(u);
    return JSON.stringify(simEff) === JSON.stringify(realEff);
  });
  rec.check('R3-15', 'permission simulator matches actual authorization engine', sim);

  /* --- overrides: deny wins, grant elevates --- */
  const ov = await page.evaluate(() => {
    const u = Store.state.users.find(x => x.username === 'employee');
    const out = {};
    out.before = Perms.canUser(u, 'reports', 'export');
    Users.setOverrides(u.id, { grants: [{ module: 'reports', op: 'export', scope: 'all' }], denies: [{ module: 'projects', op: 'view', scope: 'none' }] });
    const u2 = U.byId(Store.state.users, u.id);
    out.afterGrant = Perms.canUser(u2, 'reports', 'export');
    out.afterDeny = Perms.canUser(u2, 'projects', 'view');
    Users.setOverrides(u.id, { grants: [], denies: [] });
    return out;
  });
  rec.check('R3-16', 'override grant elevates permission', ov.before === false && ov.afterGrant === true, JSON.stringify(ov));
  rec.check('R3-17', 'override deny wins over role', ov.afterDeny === false);

  /* --- audit log --- */
  const auditOk = await page.evaluate(() => {
    const log = Store.state.auditLog;
    const recent = log.slice(-10);
    return log.length > 10 && recent.every(a => a.at && a.action && !JSON.stringify(a).includes('atlas1234') && !JSON.stringify(a).includes('passHash'));
  });
  rec.check('R3-18', 'audit log records actions without secrets', auditOk);

  /* --- password storage --- */
  const pwStorage = await page.evaluate(() => {
    const raw = JSON.stringify(Store.state);
    return { noPlaintext: !raw.includes('secret123'), hashed: Store.state.users.every(u => /^[a-f0-9]{64}$/.test(u.passHash)) };
  });
  rec.check('R3-19', 'no plaintext passwords in state; all hashed', pwStorage.noPlaintext && pwStorage.hashed);

  /* --- session behaviour --- */
  await logout(page);
  const sessionCleared = await page.evaluate(() => !localStorage.getItem('atlas-session'));
  rec.check('R3-20', 'logout clears session', sessionCleared);

  await page.close();
} catch (e) {
  rec.check('R3-ERR', 'round3 crashed', false, e.message + '\n' + e.stack);
}
try { if (demo) await demo.keepAlive.close(); } catch (e) {}
await browser.close();
const s = summary('Round 3 — Permissions & Security', rec);
fs.writeFileSync('/workspace/atlas/tests/results-round3.json', JSON.stringify(s, null, 2));
process.exit(s.fail > 0 ? 1 : 0);
