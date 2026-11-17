/* ===== Utilities ===== */
'use strict';
const U = {
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  },
  nowISO() { return new Date().toISOString(); },
  todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); },
  debounce(fn, ms) {
    let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  },
  byId(arr, id) { return (arr || []).find(x => x.id === id); },
  cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; },
  num(v, d) { const n = Number(v); return isFinite(n) ? n : (d || 0); },
  clamp(v, min, max) { return Math.min(max, Math.max(min, v)); },
  truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; },
  download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
  readFileText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });
  },
  fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  },
  csv(rows) {
    return rows.map(r => r.map(c => {
      c = String(c == null ? '' : c);
      if (/[",\n\r]/.test(c)) c = '"' + c.replace(/"/g, '""') + '"';
      return c;
    }).join(',')).join('\r\n');
  }
};

/* ===== Pure-JS SHA-256 (no secure-context dependency) ===== */
const SHA256 = (function () {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  return function (ascii) {
    const msg = unescape(encodeURIComponent(ascii));
    const l = msg.length;
    const words = [];
    for (let i = 0; i < l; i++) words[i >> 2] = (words[i >> 2] || 0) | (msg.charCodeAt(i) << (24 - (i % 4) * 8));
    words[l >> 2] = (words[l >> 2] || 0) | (0x80 << (24 - (l % 4) * 8));
    const bitLen = l * 8;
    const wCount = (((l + 8) >> 6) + 1) * 16;
    for (let i = (l >> 2) + 1; i < wCount; i++) words[i] = 0;
    words[wCount - 1] = bitLen; words[wCount - 2] = Math.floor(bitLen / 0x100000000);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Array(64);
    for (let j = 0; j < wCount; j += 16) {
      for (let i = 0; i < 16; i++) w[i] = words[j + i] || 0;
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };
})();

/* Password hashing: salted, iterated SHA-256 (PBKDF-style, deterministic across browsers) */
const Passwords = {
  iterations: 6000,
  hash(password, salt) {
    let h = SHA256(salt + ':' + password);
    for (let i = 0; i < this.iterations; i++) h = SHA256(h + ':' + salt + ':' + i);
    return h;
  },
  make(password) {
    const salt = U.uid('s') + U.uid('s');
    return { salt, hash: this.hash(password, salt) };
  },
  verify(password, salt, expected) {
    return this.hash(password, salt) === expected;
  }
};
