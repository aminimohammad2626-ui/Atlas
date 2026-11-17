/* Round 2 — Data persistence and recovery */
import { launch, newPage, recorder, summary, setupDemo, doLogin, logout, APP_URL } from './helper.mjs';
import fs from 'fs';
global.__REC = recorder('round2');
const rec = global.__REC;
const browser = await launch();
let demo;

try {
  demo = await setupDemo(browser);
  const page = await newPage(browser);
  await page.goto(APP_URL);
  await page.waitForTimeout(600);
  await doLogin(page, 'admin', 'atlas1234');

  /* make a change, then reload: localStorage persistence */
  await page.evaluate(() => { Org.createDepartment({ name: 'دپارتمان ماندگار' }); Store.persist(); });
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(700);
  await doLogin(page, 'admin', 'atlas1234');
  const survived = await page.evaluate(() => Store.state.departments.some(d => d.name === 'دپارتمان ماندگار'));
  rec.check('R2-01', 'data survives reload (localStorage)', survived);

  /* portable embedded save: download fallback */
  await page.evaluate(() => { SaveSys.fileHandle = null; });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => SaveSys.save({ silent: true }))
  ]);
  const savedPath = '/tmp/atlas-saved.html';
  await download.saveAs(savedPath);
  const savedHtml = fs.readFileSync(savedPath, 'utf8');
  const m = savedHtml.match(/<script id="atlas-embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
  rec.check('R2-02', 'save produces HTML with embedded data', !!m && m[1].length > 100, 'embedded len=' + (m ? m[1].length : 0));
  const embedded = JSON.parse(m[1].replace(/<\\\//g, '</'));
  rec.check('R2-03', 'embedded data contains the made change', embedded.departments.some(d => d.name === 'دپارتمان ماندگار'));
  const pwOk = embedded.users.length >= 4 && embedded.users.every(u => /^[a-f0-9]{64}$/.test(u.passHash) && u.salt && !('password' in u));
  rec.check('R2-04', 'embedded data has users with hashed passwords (no plaintext)', pwOk, JSON.stringify(embedded.users[0]).slice(0, 100));
  rec.check('R2-04b', 'no plaintext password in embedded data JSON', !m[1].includes('atlas1234'));

  /* open saved file as a new app instance (separate browser for true isolation) */
  await page.close();
  await demo.keepAlive.close();
  await browser.close();
  const browser2 = await launch();
  const page2 = await newPage(browser2);
  await page2.goto('file://' + savedPath);
  await page2.waitForTimeout(800);
  const carried = await page2.evaluate(() => ({
    dept: Store.state.departments.some(d => d.name === 'دپارتمان ماندگار'),
    users: Store.state.users.length,
    projects: Store.state.projects.length,
    tasks: Store.state.tasks.length
  }));
  rec.check('R2-05', 'saved HTML carries data to a new instance', carried.dept && carried.users >= 4 && carried.projects >= 3, JSON.stringify(carried));
  const hasLogin2 = await page2.$('#login-form');
  rec.check('R2-05b', 'saved instance shows login (no session leakage)', !!hasLogin2);
  if (hasLogin2) {
    await page2.fill('#lg-user', 'admin');
    await page2.fill('#lg-pass', 'atlas1234');
    await page2.click('#login-form button[type=submit]');
    await page2.waitForTimeout(500);
  }
  rec.check('R2-06', 'login works on saved instance (password hashes preserved)', !!(await page2.$('.layout')));

  /* backup create + validate + tamper rejection */
  const backup = await page2.evaluate(() => Backup.create());
  fs.writeFileSync('/tmp/atlas-backup.json', JSON.stringify(backup));
  const val = await page2.evaluate(b => Backup.validate(b).ok, backup);
  rec.check('R2-07', 'backup validates', val);

  const tampered = JSON.parse(JSON.stringify(backup));
  tampered.data.projects[0].title = 'HACKED';
  const tamperRes = await page2.evaluate(b => Backup.validate(b), tampered);
  rec.check('R2-08', 'tampered backup rejected (checksum)', tamperRes.ok === false && tamperRes.msg === 'checksum', JSON.stringify(tamperRes));

  const malformed = await page2.evaluate(() => Backup.validate({ foo: 1 }));
  rec.check('R2-09', 'malformed backup rejected', malformed.ok === false);

  /* restore into a CLEAN app */
  await page2.close();
  await browser2.close();
  const browser3 = await launch();
  const page3 = await newPage(browser3);
  await page3.goto(APP_URL);
  await page3.waitForTimeout(500);
  await page3.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page3.reload();
  await page3.waitForTimeout(700);
  const cleanState = await page3.evaluate(() => Store.state.users.length);
  rec.check('R2-10', 'clean instance has no users', cleanState === 0, 'users=' + cleanState);
  const restoreRes = await page3.evaluate(b => {
    try { const r = Backup.restore(b); return { ok: true, counts: r.counts, migrated: r.migrated }; }
    catch (e) { return { ok: false, err: e.message }; }
  }, backup);
  rec.check('R2-11', 'restore into clean app succeeds', restoreRes.ok && restoreRes.counts.users >= 4, JSON.stringify(restoreRes).slice(0, 120));
  const restoredDates = await page3.evaluate(() => {
    const p = Store.state.projects[0];
    return { start: p.startDate, end: p.endDate, tasks: Store.state.tasks.length };
  });
  rec.check('R2-12', 'restored dates are canonical Gregorian ISO', /^\d{4}-\d{2}-\d{2}$/.test(restoredDates.start), JSON.stringify(restoredDates));
  /* language switch after restore */
  await page3.evaluate(() => { I18N.setLang('en'); });
  const enDate = await page3.evaluate(() => Cal.formatISO(Store.state.projects[0].startDate, 'en'));
  await page3.evaluate(() => { I18N.setLang('fa'); });
  const faDate = await page3.evaluate(() => Cal.formatISO(Store.state.projects[0].startDate, 'fa'));
  rec.check('R2-13', 'dates consistent after language switch (same underlying date)', !!enDate && !!faDate && enDate !== faDate, enDate + ' vs ' + faDate);
  await page3.close(); await browser3.close();

  /* interrupted restore: migration failure must roll back */
  const browser4 = await launch();
  const page4 = await newPage(browser4);
  await page4.goto(APP_URL);
  await page4.waitForTimeout(600);
  const backupJson = fs.readFileSync('/tmp/atlas-backup.json', 'utf8');
  await page4.evaluate(bj => { Backup.restore(JSON.parse(bj)); }, backupJson);
  await page4.reload();
  await page4.waitForTimeout(700);
  const lg = await doLogin(page4, 'admin', 'atlas1234');
  rec.check('R2-13b', 'login works after restore', lg && !!(await page4.$('.layout')));
  const rollbackRes = await page4.evaluate(() => {
    const before = JSON.stringify(Store.state.departments.length) + ':' + Store.state.tasks.length;
    const b = Backup.create();
    const origVerify = Backup.verify;
    Backup.verify = () => { throw new Error('simulated crash'); };
    let err = null;
    try { Backup.restore(b); } catch (e) { err = e.message; }
    Backup.verify = origVerify;
    const after = JSON.stringify(Store.state.departments.length) + ':' + Store.state.tasks.length;
    return { err, stateUnchanged: before === after };
  });
  rec.check('R2-14', 'interrupted restore rolls back to previous state', rollbackRes.err !== null && rollbackRes.stateUnchanged, JSON.stringify(rollbackRes));

  /* autosave: set interval to minimum and wait */
  await page4.evaluate(() => {
    Org.createDepartment({ name: 'بخش ذخیره خودکار' });
    Store.state.settings.autosave = true;
    Store.state.settings.autosaveInterval = 15;
    Store.markDirty();
    SaveSys.scheduleAutosave();
  });
  const beforeAutosave = await page4.evaluate(() => {
    const raw = localStorage.getItem('atlas-state');
    return raw && JSON.parse(raw).departments.some(d => d.name === 'بخش ذخیره خودکار');
  });
  await page4.waitForTimeout(16500);
  const autosaved = await page4.evaluate(() => {
    const raw = localStorage.getItem('atlas-state');
    return raw && JSON.parse(raw).departments.some(d => d.name === 'بخش ذخیره خودکار');
  });
  rec.check('R2-15', 'autosave persists to local storage (not before, yes after)', autosaved === true && beforeAutosave === false, 'before=' + beforeAutosave + ' after=' + autosaved);

  /* old-format backup: schema 1 backup restores into current with migration */
  const schema1 = JSON.parse(JSON.stringify(backup));
  schema1.data.meta.schemaVersion = 1;
  delete schema1.data.announcements;
  schema1.integrity.checksum = await page4.evaluate(d => SHA256(JSON.stringify(d)), schema1.data);
  const migRes = await page4.evaluate(b => {
    try {
      const r = Backup.restore(b);
      return { ok: true, migrated: r.migrated, schema: Store.state.meta.schemaVersion, hasAnn: Array.isArray(Store.state.announcements) };
    } catch (e) { return { ok: false, err: e.message }; }
  }, schema1);
  await page4.close(); await browser4.close();
  rec.check('R2-16', 'schema-1 backup restores cleanly into current base app', migRes.ok && migRes.hasAnn === true, JSON.stringify(migRes));
  

} catch (e) {
  rec.check('R2-ERR', 'round2 crashed', false, e.message + '\n' + e.stack);
}

const s = summary('Round 2 — Persistence & Recovery', rec);
fs.writeFileSync('/workspace/atlas/tests/results-round2.json', JSON.stringify(s, null, 2));
process.exit(s.fail > 0 ? 1 : 0);
