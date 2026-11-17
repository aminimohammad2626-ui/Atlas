/* Round 6 — Professional UX features: Kanban DnD, command palette, shortcuts */
import fs from 'fs';

const results = [];
const check = (id, desc, ok, detail) => { results.push({ id, desc, ok: !!ok, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + desc + (ok ? '' : '  :: ' + (detail || ''))); };

const { chromium } = await import('/tmp/node_modules/playwright/index.mjs');
const chromiumPkg = (await import('/tmp/node_modules/@sparticuz/chromium/build/index.js')).default;
const exePath = await chromiumPkg.executablePath();
const browser = await chromium.launch({ executablePath: exePath, args: [...chromiumPkg.args, '--single-process', '--no-sandbox', '--no-zygote'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

try {
  await page.goto('http://127.0.0.1:8899/Atlas.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* R6-01: version bumped */
  check('R6-01', 'app version is 1.1.0', await page.evaluate(() => window.ATLAS_META && ATLAS_META.appVersion === '1.1.0'), String(await page.evaluate(() => window.ATLAS_META && ATLAS_META.appVersion)));

  /* login as admin (through the real login form) */
  await page.click('#su-demo');
  await page.waitForTimeout(1200);
  const loginForm = async (u, p) => {
    await page.fill('#lg-user', u);
    await page.fill('#lg-pass', p);
    await page.click('#login-form button[type="submit"]');
    await page.waitForTimeout(800);
  };
  await loginForm('admin', 'atlas1234');

  /* ---- Command palette ---- */
  // R6-02: Ctrl+K opens
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  check('R6-02', 'Ctrl+K opens command palette', await page.evaluate(() => !!UI.palette.el && !!document.querySelector('.palette-input')));
  // R6-03: default shows nav + actions, permission-aware
  const p1 = await page.evaluate(() => ({
    total: UI.palette.results.length,
    hasNav: UI.palette.results.some(s => s.group === 'nav'),
    hasActions: UI.palette.results.some(s => s.group === 'actions'),
  }));
  check('R6-03', 'palette lists pages + actions for admin', p1.total > 5 && p1.hasNav && p1.hasActions, JSON.stringify(p1));
  // R6-04: typing filters records (tasks) — data-driven search term
  const term = await page.evaluate(() => {
    const tk = Atlas.Tasks.visible()[0];
    return tk ? tk.title.slice(0, Math.min(6, tk.title.length)) : '';
  });
  await page.fill('.palette-input', term);
  await page.waitForTimeout(300);
  const p2 = await page.evaluate((term) => ({ records: UI.palette.results.filter(s => s.group === 'records').length, total: UI.palette.results.length, term }), term);
  check('R6-04', 'typing filters and finds task records', p2.total > 0 && p2.records > 0, JSON.stringify(p2));
  // R6-05: Enter navigates + closes
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const p3 = await page.evaluate(() => ({ closed: !UI.palette.el, view: UI.route.view }));
  check('R6-05', 'Enter selects and closes palette', p3.closed, JSON.stringify(p3));
  // R6-06: Esc closes
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('R6-06', 'Esc closes palette', await page.evaluate(() => !UI.palette.el));
  // R6-07: palette respects permissions (employee: no admin pages/actions)
  await page.evaluate(() => { Atlas.Auth.logout(); UI.render(); });
  await page.waitForTimeout(500);
  await loginForm('employee', 'atlas1234');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  const p4 = await page.evaluate(() => {
    if (!UI.palette.el) return { open: false };
    return {
      open: true,
      noUsers: !UI.palette.results.some(s => s.label.includes('کاربران') || s.label.toLowerCase().includes('user')),
      noNewUser: !UI.palette.results.some(s => s.label.includes('کاربر جدید') || s.label.toLowerCase().includes('new user')),
    };
  });
  check('R6-07', 'palette hides admin pages/actions for employee', p4.open && p4.noUsers && p4.noNewUser, JSON.stringify(p4));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // back to admin
  await page.evaluate(() => { Atlas.Auth.logout(); UI.render(); });
  await page.waitForTimeout(400);
  await loginForm('admin', 'atlas1234');

  /* ---- Kanban drag & drop ---- */
  await page.evaluate(() => UI.nav('tasks'));
  await page.waitForTimeout(600);
  await page.evaluate(() => { TaskViews.filters.mode = 'board'; UI.views.tasks.renderList(); });
  await page.waitForTimeout(400);
  // R6-08: board renders columns and draggable cards
  const b1 = await page.evaluate(() => ({
    cols: document.querySelectorAll('[data-col]').length,
    cards: document.querySelectorAll('[data-task][draggable="true"]').length,
  }));
  check('R6-08', 'board renders columns with draggable cards', b1.cols >= 3 && b1.cards > 0, JSON.stringify(b1));
  // R6-09: drag a card to an allowed column -> status changes
  const d1 = await page.evaluate(() => {
    const card = document.querySelector('[data-task][draggable="true"]');
    const task = Atlas.Tasks.get(card.dataset.task);
    const cols = [...document.querySelectorAll('[data-col]')];
    const target = cols.find(c => c.dataset.col !== task.status && Atlas.Workflow.canTransition('task', task.status, c.dataset.col));
    if (!target) return { skipped: true };
    return { from: task.status, to: target.dataset.col, id: task.id };
  });
  if (d1.skipped) {
    check('R6-09', 'drag changes status', false, 'no draggable card with allowed transition');
  } else {
    const cardSel = '[data-task="' + d1.id + '"]';
    const colSel = '[data-col="' + d1.to + '"]';
    await page.dragAndDrop(cardSel, colSel);
    await page.waitForTimeout(600);
    const after = await page.evaluate((id) => Atlas.Tasks.get(id).status, d1.id);
    check('R6-09', 'drag card to allowed column changes status', after === d1.to, d1.from + ' -> ' + after);
    // R6-10: history entry recorded
    const hist = await page.evaluate((id) => {
      const t = Atlas.Tasks.get(id);
      const last = (t.history || []).filter(h => h.action === 'status').pop();
      return last ? last.details.to : null;
    }, d1.id);
    check('R6-10', 'drop records status history', hist === d1.to, JSON.stringify(hist));
  }
  // R6-11: invalid transition rejected with toast
  const d2 = await page.evaluate(() => {
    const tasks = Atlas.Tasks.visible();
    for (const t of tasks) {
      const cols = Atlas.Workflow.statuses('task').filter(s => s.kind !== 'cancelled').map(s => s.id);
      const bad = cols.find(c => c !== t.status && !Atlas.Workflow.canTransition('task', t.status, c));
      if (bad) return { id: t.id, from: t.status, bad };
    }
    return null;
  });
  if (d2) {
    await page.evaluate(() => { TaskViews.filters.mode = 'board'; UI.views.tasks.renderList(); });
    await page.waitForTimeout(300);
    const bad = await page.evaluate(({ id, bad }) => {
      const card = document.querySelector('[data-task="' + id + '"]');
      const col = document.querySelector('[data-col="' + bad + '"]');
      if (!card || !col) return 'missing';
      const dt = new DataTransfer();
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      col.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
      const t = Atlas.Tasks.get(id);
      return { status: t.status, toast: (document.querySelector('.toast') || {}).textContent || '' };
    }, d2);
    check('R6-11', 'invalid drop rejected (status unchanged)', bad.status === d2.from, JSON.stringify(bad));
  } else {
    check('R6-11', 'invalid drop rejected', true, 'no invalid pair available in seed');
  }
  // R6-12: employee cannot drag (no draggable cards)
  await page.evaluate(() => { Atlas.Auth.logout(); UI.render(); });
  await page.waitForTimeout(400);
  await loginForm('employee', 'atlas1234');
  await page.evaluate(() => UI.nav('tasks'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { TaskViews.filters.mode = 'board'; UI.views.tasks.renderList(); });
  await page.waitForTimeout(300);
  const b2 = await page.evaluate(() => {
    const me = Atlas.Auth.currentEmployee();
    const drag = [...document.querySelectorAll('[data-task][draggable="true"]')].map(c => c.dataset.task);
    const mine = new Set(Atlas.Tasks.visible().filter(x => me && (x.assigneeIds || []).includes(me.id)).map(x => x.id));
    return { dragCount: drag.length, allMine: drag.every(id => mine.has(id)) };
  });
  check('R6-12', 'employee can only drag own assigned tasks (perm enforced)', b2.allMine, JSON.stringify(b2));
  await page.evaluate(() => { Atlas.Auth.logout(); UI.render(); });
  await page.waitForTimeout(400);
  await loginForm('admin', 'atlas1234');

  /* ---- keyboard shortcuts ---- */
  await page.evaluate(() => UI.nav('dashboard'));
  await page.waitForTimeout(500);
  // R6-13: '/' focuses topbar search
  await page.keyboard.press('/');
  await page.waitForTimeout(200);
  check('R6-13', "'/' focuses topbar search", await page.evaluate(() => document.activeElement && document.activeElement.id === 'topbar-q'));
  await page.evaluate(() => document.activeElement.blur());
  // R6-14: Ctrl+S triggers save (download fallback in headless -> state marked saved)
  const s1 = await page.evaluate(() => {
    Atlas.Store.dirty = true;
  });
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(800);
  check('R6-14', 'Ctrl+S saves', await page.evaluate(() => !Atlas.Store.dirty), 'dirty flag cleared');

  /* R6-15: no page errors during the whole round */
  check('R6-15', 'no page errors during round 6', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));

} finally {
  fs.writeFileSync('/workspace/atlas/tests/results-round6.json', JSON.stringify({
    name: 'Round 6 — Professional UX (Kanban DnD, palette, shortcuts)',
    pass: results.filter(r => r.ok).length,
    fail: results.filter(r => !r.ok).length,
    results,
  }, null, 2));
  console.log('\n=== Round 6: ' + results.filter(r => r.ok).length + ' passed, ' + results.filter(r => !r.ok).length + ' failed, ' + pageErrors.length + ' page errors ===');
  await browser.close().catch(() => {});
}
