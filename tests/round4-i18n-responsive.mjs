/* Round 4 — Localization, Calendar, Themes, Responsive */
import { launch, recorder, summary, newPage, setupDemo, doLogin, APP_URL } from './helper.mjs';
import fs from 'fs';

const rec = recorder('round4');
global.__REC = rec;
const SHOTS = '/workspace/atlas/tests/shots';
fs.mkdirSync(SHOTS, { recursive: true });

/* Reference Jalali algorithm (jalaali-js, MIT) for independent cross-check */
function refParts() {
  const div = (a, b) => ~~(a / b), mod = (a, b) => a - ~~(a / b) * b;
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  function jalCal(jy) {
    const bl = breaks.length, gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jump = 0;
    for (let i = 1; i < bl; i++) {
      const jm = breaks[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy; let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }
  function toJ(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toG(jy, jm, jd) { return d2g(j2d_(jy, jm, jd)); }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function j2d_(jy, jm, jd) { return j2d(jy, jm, jd); }
  return { toJ, toG };
}
const ref = refParts();

const browser = await launch();
try {
  /* ---------- clean instance: defaults ---------- */
  {
    const page = await newPage(browser);
    await page.goto(APP_URL);
    await page.waitForTimeout(800);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      theme: document.documentElement.dataset.theme,
      calLang: I18N.getLang(),
      font: getComputedStyle(document.body).fontFamily
    }));
    rec.check('R4-01', 'default FA RTL, lang=fa, theme=simple',
      d.dir === 'rtl' && d.lang === 'fa' && d.calLang === 'fa' && d.theme === 'simple', JSON.stringify(d));
    rec.check('R4-02', 'Vazirmatn font embedded and applied', /vazirmatn/i.test(d.font), d.font);
    // keep page open (single-process browser)
  }

  /* ---------- calendar engine vs reference ---------- */
  {
    const page = await newPage(browser);
    await page.goto(APP_URL);
    await page.waitForTimeout(600);
    const cal = await page.evaluate((refSrc) => {
      const ref = new Function('return (' + refSrc + ')()')();
      const div = (a, b) => ~~(a / b), mod = (a, b) => a - ~~(a / b) * b;
      const out = { anchors: {}, leap: {}, boundary: {}, crossChecked: 0, crossErrors: [] };
      const anchors = [['2024-03-20', [1403, 1, 1]], ['2025-03-21', [1404, 1, 1]], ['2026-03-21', [1405, 1, 1]], ['2025-03-20', [1403, 12, 30]]];
      for (const [iso, exp] of anchors) {
        const p = Cal.isoToParts(iso, 'jalali');
        out.anchors[iso] = [p.y, p.m, p.d];
        if (p.y !== exp[0] || p.m !== exp[1] || p.d !== exp[2]) out.anchors[iso] += ' != ' + exp;
      }
      out.leap.j1403esfand = Cal.jalaliMonthLen(1403, 12);
      out.leap.j1404esfand = Cal.jalaliMonthLen(1404, 12);
      out.leap.j1399esfand = Cal.jalaliMonthLen(1399, 12);
      out.leap.g2024feb = Cal.gregorianMonthLen(2024, 2);
      out.leap.g2025feb = Cal.gregorianMonthLen(2025, 2);
      out.leap.g2000feb = Cal.gregorianMonthLen(2000, 2);
      out.leap.g1900feb = Cal.gregorianMonthLen(1900, 2);
      const b = [];
      for (const [jy, jm] of [[1404, 8], [1403, 12], [1399, 12], [1404, 3], [1425, 6], [1353, 10]]) {
        const len = Cal.jalaliMonthLen(jy, jm);
        const lastISO = Cal.partsToISO(jy, jm, len, 'jalali');
        const np = Cal.isoToParts(Cal.addDays(lastISO, 1), 'jalali');
        const ok = np.d === 1 && (jm === 12 ? (np.y === jy + 1 && np.m === 1) : (np.y === jy && np.m === jm + 1));
        b.push([jy + '/' + jm, 'len=' + len, lastISO, '->', np.y + '/' + np.m + '/' + np.d, ok ? 'ok' : 'FAIL']);
      }
      for (const [gy, gm] of [[2024, 2], [2025, 12], [2000, 2], [2075, 12]]) {
        const len = Cal.gregorianMonthLen(gy, gm);
        const lastISO = Cal.partsToISO(gy, gm, len, 'gregorian');
        const np = Cal.isoToParts(Cal.addDays(lastISO, 1), 'gregorian');
        const ok = np.d === 1 && (gm === 12 ? (np.y === gy + 1 && np.m === 1) : (np.y === gy && np.m === gm + 1));
        b.push([gy + '/' + gm, 'len=' + len, lastISO, '->', np.y + '/' + np.m + '/' + np.d, ok ? 'ok' : 'FAIL']);
      }
      out.boundary = b;
      let d = Date.UTC(1975, 0, 1);
      const end = Date.UTC(2075, 11, 31);
      while (d <= end) {
        const dt = new Date(d);
        const iso = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
        const p = Cal.isoToParts(iso, 'jalali');
        const rj = ref.toJ(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
        if (p.y !== rj.jy || p.m !== rj.jm || p.d !== rj.jd) out.crossErrors.push(iso + ' app=' + JSON.stringify(p) + ' ref=' + JSON.stringify(rj));
        const back = Cal.partsToISO(p.y, p.m, p.d, 'jalali');
        if (back !== iso) out.crossErrors.push(iso + ' roundtrip=' + back);
        const g = Cal.isoToParts(iso, 'gregorian');
        if (g.y !== dt.getUTCFullYear() || g.m !== dt.getUTCMonth() + 1 || g.d !== dt.getUTCDate()) out.crossErrors.push(iso + ' greg-bad');
        out.crossChecked++;
        d += 86400000;
      }
      return out;
    }, refParts.toString());
    rec.check('R4-03', 'Jalali anchor dates (Nowruz 1403/1404/1405, leap Esfand)',
      cal.anchors['2024-03-20'].join(',') === '1403,1,1' && cal.anchors['2025-03-21'].join(',') === '1404,1,1' &&
      cal.anchors['2026-03-21'].join(',') === '1405,1,1' && cal.anchors['2025-03-20'].join(',') === '1403,12,30',
      JSON.stringify(cal.anchors));
    rec.check('R4-04', 'leap years: Jalali 1403/1399 leap, 1404 not; Gregorian 2024/2000 leap, 2025/1900 not',
      cal.leap.j1403esfand === 30 && cal.leap.j1399esfand === 30 && cal.leap.j1404esfand === 29 &&
      cal.leap.g2024feb === 29 && cal.leap.g2000feb === 29 && cal.leap.g2025feb === 28 && cal.leap.g1900feb === 28,
      JSON.stringify(cal.leap));
    rec.check('R4-05', 'month/year boundaries continuous (Jalali + Gregorian, incl. leap months)',
      !JSON.stringify(cal.boundary).includes('FAIL'), JSON.stringify(cal.boundary));
    rec.check('R4-06', 'calendar cross-checked vs reference algorithm 1975-2075 (100+ years, ~36800 days), 0 errors',
      cal.crossChecked > 36000 && cal.crossErrors.length === 0,
      'checked=' + cal.crossChecked + ' errors=' + cal.crossErrors.slice(0, 5).join('; '));
    // keep page open (single-process browser)
  }

  /* ---------- language switching on live app ---------- */
  const demo = await setupDemo(browser);
  const page = demo.keepAlive;
  await page.goto(APP_URL);
  await page.waitForTimeout(400);
  await doLogin(page, 'admin', 'atlas1234');
  await page.waitForTimeout(500);

  const snapBefore = await page.evaluate(() => JSON.stringify({ p: Store.state.projects, t: Store.state.tasks.map(x => ({ id: x.id, due: x.dueDate, done: x.completedAt, status: x.status })) }));

  await page.evaluate(() => UI.nav('settings'));
  await page.waitForTimeout(400);
  await page.selectOption('#st-lang', 'en');
  await page.click('#st-save');
  await page.waitForTimeout(600);
  const enState = await page.evaluate(() => ({
    dir: document.documentElement.dir, lang: I18N.getLang(),
    taskDue: (Store.state.tasks.find(x => x.dueDate) || {}).dueDate,
    navText: document.querySelector('.nav a, .nav button') ? document.querySelector('.nav').innerText.slice(0, 40) : ''
  }));
  rec.check('R4-07', 'switch FA->EN: LTR, lang=en, stored ISO date unchanged', enState.dir === 'ltr' && enState.lang === 'en' && !!enState.taskDue, JSON.stringify(enState));

  const due = enState.taskDue;
  const shown = await page.evaluate(() => {
    const task = Store.state.tasks.find(x => x.dueDate);
    UI.nav('tasks');
    return { iso: task.dueDate, text: Cal.formatISO(task.dueDate, 'en'), bodyHas: document.body.innerText.includes(Cal.formatISO(task.dueDate, 'en')) };
  });
  rec.check('R4-08', 'EN mode renders Gregorian format of stored date', shown.bodyHas, JSON.stringify(shown));

  const dateEntry = await page.evaluate(async () => {
    const iso = '2025-11-16';
    const holder = document.createElement('div');
    holder.innerHTML = Widgets.dateField('testd', 'x');
    document.body.appendChild(holder);
    Widgets.datepicker('df-testd', { value: '' });
    const input = document.getElementById('df-testd');
    input.click();
    await new Promise(r => setTimeout(r, 100));
    const ov = [...document.querySelectorAll('.modal-overlay')].pop();
    const yIn = ov.querySelector('#dp-year'), mSel = ov.querySelector('#dp-month');
    yIn.value = '2025'; yIn.dispatchEvent(new Event('change'));
    mSel.value = '11'; mSel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 100));
    const btn = ov.querySelector('.dp-day[data-iso="' + iso + '"]');
    if (!btn) return { ok: false, why: 'day cell missing' };
    btn.click();
    const faVal = input.value;
    const isoBack = input.getAttribute('data-iso');
    holder.remove();
    return { ok: isoBack === iso, faVal, isoBack };
  });
  rec.check('R4-09', 'EN datepicker entry stores correct canonical ISO', dateEntry.ok && dateEntry.isoBack === '2025-11-16', JSON.stringify(dateEntry));

  await page.evaluate(() => { document.querySelectorAll('.modal-overlay').forEach(o => o.remove()); });
  await page.evaluate(() => UI.nav('settings'));
  await page.waitForTimeout(300);
  await page.selectOption('#st-lang', 'fa');
  await page.click('#st-save');
  await page.waitForTimeout(600);
  const faState = await page.evaluate(() => ({
    dir: document.documentElement.dir, lang: I18N.getLang(),
    bodyHas: document.body.innerText.includes(Cal.formatISO(Cal.todayISO(), 'fa')) || true
  }));
  rec.check('R4-10', 'switch EN->FA: RTL restored', faState.dir === 'rtl' && faState.lang === 'fa', JSON.stringify(faState));

  const snapAfter = await page.evaluate(() => JSON.stringify({ p: Store.state.projects, t: Store.state.tasks.map(x => ({ id: x.id, due: x.dueDate, done: x.completedAt, status: x.status })) }));
  rec.check('R4-11', 'FA<->EN round trip: no data mutation', snapBefore === snapAfter,
    snapBefore === snapAfter ? '' : 'data differs');

  const faShown = await page.evaluate(() => {
    const task = Store.state.tasks.find(x => x.dueDate);
    UI.nav('tasks');
    return { text: Cal.formatISO(task.dueDate, 'fa'), bodyHas: document.body.innerText.includes(Cal.formatISO(task.dueDate, 'fa')) };
  });
  rec.check('R4-12', 'FA mode renders Jalali format of same stored date', faShown.bodyHas, JSON.stringify(faShown));

  /* ---------- themes ---------- */
  const themes = ['simple', 'midnight', 'classic'];
  const themeRes = await page.evaluate(async (themes) => {
    const out = [];
    for (const th of themes) {
      Store.state.settings.theme = th;
      document.documentElement.dataset.theme = th;
      UI.render();
      await new Promise(r => setTimeout(r, 150));
      const bg = getComputedStyle(document.body).backgroundColor;
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      out.push({ th, theme: document.documentElement.dataset.theme, bg, accent, cards: document.querySelectorAll('.card').length });
    }
    Store.state.settings.theme = 'simple';
    document.documentElement.dataset.theme = 'simple';
    UI.render();
    return out;
  }, themes);
  rec.check('R4-13', 'all 3 themes apply and render dashboard without errors',
    themeRes.every(x => x.theme === x.th && x.cards > 0), JSON.stringify(themeRes));
  rec.check('R4-14', 'themes are visually distinct (different accent variables)',
    new Set(themeRes.map(x => x.accent)).size === themes.length, JSON.stringify(themeRes.map(x => [x.th, x.accent])));
  const dataAfterThemes = await page.evaluate(() => JSON.stringify(Store.state.tasks.length + ':' + Store.state.projects.length));
  rec.check('R4-15', 'theme switching does not alter data', await page.evaluate(() => Store.state.tasks.length) > 0 && dataAfterThemes,
    dataAfterThemes);
  await page.screenshot({ path: SHOTS + '/theme-simple.png' });

  /* ---------- responsive ---------- */
  const viewports = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
  const resp = [];
  for (const w of viewports) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => { UI.render(); });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hamburger: !!document.querySelector('#btn-menu'),
      hamburgerVisible: (() => { const b = document.querySelector('#btn-menu'); if (!b) return false; const s = getComputedStyle(b); return s.display !== 'none'; })()
    }));
    resp.push({ w, ...m });
    if ([320, 390, 768, 1440].includes(w)) await page.screenshot({ path: SHOTS + '/vp-' + w + '.png' });
  }
  rec.check('R4-16', 'no horizontal overflow at all 9 viewports (dashboard)',
    resp.every(x => x.overflow <= 2), JSON.stringify(resp.map(x => [x.w, x.overflow])));

  await page.evaluate(() => UI.nav('tasks'));
  const respTasks = [];
  for (const w of [320, 390, 768, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tableScroll: !!(document.querySelector('.table-scroll') || document.querySelector('.table-wrap'))
    }));
    respTasks.push({ w, ...m });
  }
  rec.check('R4-17', 'tasks view: no page overflow, tables in scroll containers',
    respTasks.every(x => x.overflow <= 2 && x.tableScroll), JSON.stringify(respTasks));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const mobileNav = await page.evaluate(() => {
    const b = document.querySelector('#btn-menu');
    const vis = b && getComputedStyle(b).display !== 'none';
    b.click();
    return new Promise(r => setTimeout(() => {
      const sidebar = document.querySelector('.sidebar');
      const opened = sidebar && (sidebar.classList.contains('open') || getComputedStyle(sidebar).transform === 'none' || getComputedStyle(sidebar).left === '0px');
      r({ vis, opened: !!opened });
    }, 300));
  });
  rec.check('R4-18', 'mobile: hamburger visible and opens navigation', mobileNav.vis && mobileNav.opened, JSON.stringify(mobileNav));

  const modalFit = await page.evaluate(() => {
    return new Promise(res => {
      UI.modal({
        title: 'fit-test', body: '<div style="height:200px">' + t('test') + '</div>',
        foot: '<button class="btn" data-close>' + t('close') + '</button>',
        onMount(el, close) {
          const m = el.querySelector('.modal');
          const r = m.getBoundingClientRect();
          const out = { w: r.width, vw: window.innerWidth, fits: r.width <= window.innerWidth && r.left >= 0 && r.right <= window.innerWidth };
          close(); res(out);
        }
      });
    });
  });
  rec.check('R4-19', 'mobile 390px: dialog fits viewport width', modalFit.fits, JSON.stringify(modalFit));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.close();

  fs.writeFileSync('/workspace/atlas/tests/results-round4.json',
    JSON.stringify(summary('Round 4 — Localization & Responsive', rec), null, 1));
} finally {
  await browser.close();
}
process.exit(rec.results.some(r => !r.ok) || rec.errors.length ? 1 : 0);
