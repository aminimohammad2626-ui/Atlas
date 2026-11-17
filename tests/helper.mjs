/* Shared browser test helper for Atlas QA */
import { chromium as pw } from '/tmp/node_modules/playwright-core/index.mjs';
import chromium from '/tmp/node_modules/@sparticuz/chromium/build/index.js';

export async function launch() {
  const execPath = await chromium.executablePath();
  const browser = await pw.launch({
    executablePath: execPath,
    args: [...chromium.args, '--no-sandbox', '--single-process', '--no-zygote'],
    headless: true
  });
  return browser;
}

export function recorder(name) {
  const results = [];
  const errors = [];
  return {
    results,
    errors,
    check(id, desc, ok, detail) {
      results.push({ id, desc, ok: !!ok, detail: detail || '' });
      console.log((ok ? 'PASS' : 'FAIL') + '  ' + id + '  ' + desc + (ok ? '' : '  -> ' + (detail || '')));
    },
    pageErrors: errors
  };
}

export function summary(name, rec) {
  const pass = rec.results.filter(r => r.ok).length;
  const fail = rec.results.length - pass;
  console.log(`\n=== ${name}: ${pass} passed, ${fail} failed, ${rec.errors.length} page errors ===`);
  if (rec.errors.length) console.log('PAGE ERRORS:\n' + rec.errors.join('\n'));
  return { name, pass, fail, pageErrors: rec.errors, results: rec.results };
}

export async function newPage(browser, opts) {
  const page = await browser.newPage({ viewport: (opts && opts.viewport) || { width: 1280, height: 800 } });
  page.on('pageerror', e => { if (global.__REC) global.__REC.errors.push('PAGEERROR: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && global.__REC) global.__REC.errors.push('CONSOLE: ' + m.text()); });
  return page;
}

export async function login(page, username, password) {
  await page.goto('file:///workspace/atlas/dist/Atlas.html');
  await page.waitForTimeout(600);
  const hasLogin = await page.$('#login-form');
  if (hasLogin) {
    await page.fill('#lg-user', username);
    await page.fill('#lg-pass', password);
    await page.click('#login-form button[type=submit]');
    await page.waitForTimeout(400);
  }
}

export const APP_URL = 'file:///workspace/atlas/dist/Atlas.html';

export async function setupDemo(browser) {
  const page = await newPage(browser);
  await page.goto(APP_URL);
  await page.waitForTimeout(500);
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(800);
  const su = await page.$('#su-demo');
  if (su) {
    await page.click('#su-demo');
    await page.waitForTimeout(1200);
  }
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-state') || 'null'));
  await page.goto('about:blank');
  return { state, keepAlive: page };
}

export async function doLogin(page, username, password) {
  await page.waitForTimeout(300);
  const hasLogin = await page.$('#login-form');
  if (!hasLogin) return false;
  await page.fill('#lg-user', username);
  await page.fill('#lg-pass', password);
  await page.click('#login-form button[type=submit]');
  await page.waitForTimeout(500);
  return true;
}

export async function logout(page) {
  const btn = await page.$('#btn-logout');
  if (btn) { await btn.click(); await page.waitForTimeout(400); }
}
