/* ===== Calendar engine: Gregorian <-> Jalali (algorithmic, no hardcoded ranges) ===== */
const Cal = (function () {
  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;

  const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14, jp = BREAKS[0], jump = 0;
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalali year: ' + jy);
    for (let i = 1; i < bl; i++) {
      const jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
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
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
      k -= 186;
    } else {
      jy -= 1; k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }

  function isLeapJalali(jy) { return jalCal(jy).leap === 0; }
  function isLeapGregorian(gy) { return (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0; }
  function jalaliMonthLen(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalali(jy) ? 30 : 29;
  }
  function gregorianMonthLen(gy, gm) {
    return [31, isLeapGregorian(gy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][gm - 1];
  }

  /* ISO date strings (YYYY-MM-DD, Gregorian) are the canonical storage format */
  function parseISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1) return null;
    if (mo === 2 && d > 29) return null;
    if (d > gregorianMonthLen(y, mo)) return null;
    return { y, m: mo, d };
  }
  function toISO(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /* {y,m,d} in the requested calendar system -> ISO gregorian */
  function partsToISO(y, m, d, system) {
    if (system === 'gregorian') return toISO(y, m, d);
    return toISO(...(function () { const g = d2g(j2d(y, m, d)); return [g.gy, g.gm, g.gd]; })());
  }
  /* ISO -> parts in requested system */
  function isoToParts(iso, system) {
    const p = parseISO(iso);
    if (!p) return null;
    if (system === 'gregorian') return { y: p.y, m: p.m, d: p.d };
    const j = d2j(g2d(p.y, p.m, p.d));
    return { y: j.jy, m: j.jm, d: j.jd };
  }

  const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const FA_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const FA_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const EN_WEEKDAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const EN_WEEKDAYS_SHORT = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];

  function systemFor(lang) { return lang === 'fa' ? 'jalali' : 'gregorian'; }

  /* Weekday index (0=Saturday .. 6=Friday) from ISO date */
  function weekdayIndexSat(iso) {
    const p = parseISO(iso);
    const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
    return (d.getUTCDay() + 1) % 7; // JS: 0=Sun..6=Sat -> ours: 0=Sat
  }

  function weekdayName(iso, lang, short) {
    const idx = weekdayIndexSat(iso);
    if (lang === 'fa') return short ? FA_WEEKDAYS_SHORT[idx] : FA_WEEKDAYS[idx];
    return short ? EN_WEEKDAYS_SHORT[idx] : EN_WEEKDAYS[idx];
  }

  function monthName(m, system) {
    return system === 'jalali' ? FA_MONTHS[m - 1] : EN_MONTHS[m - 1];
  }

  function monthLen(y, m, system) {
    return system === 'jalali' ? jalaliMonthLen(y, m) : gregorianMonthLen(y, m);
  }

  function formatISO(iso, lang, opts) {
    opts = opts || {};
    const sys = systemFor(lang);
    const p = isoToParts(iso, sys);
    if (!p) return iso || '';
    if (opts.long) {
      return weekdayName(iso, lang) + '، ' + p.d + ' ' + monthName(p.m, sys) + ' ' + p.y;
    }
    if (opts.medium) return p.d + ' ' + monthName(p.m, sys) + ' ' + p.y;
    return lang === 'fa'
      ? toISO(p.y, p.m, p.d).replace(/-/g, '/')
      : toISO(p.y, p.m, p.d);
  }

  function formatTimestamp(ts, lang, withTime) {
    if (!ts) return '—';
    const d = new Date(ts);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let out = formatISO(iso, lang);
    if (withTime !== false) {
      const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      out += ' ' + hm;
    }
    return out;
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* add days to ISO date */
  function addDays(iso, n) {
    const p = parseISO(iso);
    const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function diffDays(a, b) {
    const pa = parseISO(a), pb = parseISO(b);
    return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
  }
  function addMonths(y, m, n, system) {
    let t = y * 12 + (m - 1) + n;
    return { y: div(t, 12), m: mod(t, 12) + 1 };
  }

  /* first weekday-index (0=Sat) of a month grid start */
  function monthGridStart(y, m, system, weekStart) {
    const firstISO = partsToISO(y, m, 1, system);
    let startIdx = (weekdayIndexSat(firstISO) - weekStart + 7) % 7;
    return { firstISO, startIdx };
  }

  return {
    parseISO, toISO, partsToISO, isoToParts,
    isLeapJalali, isLeapGregorian, jalaliMonthLen, gregorianMonthLen,
    systemFor, weekdayIndexSat, weekdayName, monthName, monthLen,
    formatISO, formatTimestamp, todayISO, addDays, diffDays, addMonths, monthGridStart,
    FA_MONTHS, EN_MONTHS, FA_WEEKDAYS, FA_WEEKDAYS_SHORT, EN_WEEKDAYS, EN_WEEKDAYS_SHORT
  };
})();
