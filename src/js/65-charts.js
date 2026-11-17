/* ===== SVG charts (no external libraries) ===== */
const Charts = {
  donut(items, size) {
    size = size || 150;
    const total = items.reduce((a, x) => a + x.value, 0);
    if (!total) return '<div class="empty-state small">' + t('noData') + '</div>';
    const r = size / 2 - 12, cx = size / 2, cy = size / 2, sw = 22;
    let angle = -90, paths = '';
    items.forEach(x => {
      if (!x.value) return;
      const frac = x.value / total;
      const end = angle + frac * 360;
      const large = frac > .5 ? 1 : 0;
      const a0 = angle * Math.PI / 180, a1 = end * Math.PI / 180;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      paths += '<path d="M ' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + '" fill="none" stroke="' + x.color + '" stroke-width="' + sw + '"><title>' + U.esc(x.label) + ': ' + x.value + '</title></path>';
      angle = end;
    });
    let legend = '<div class="chart-legend">';
    items.forEach(x => {
      legend += '<div class="legend-item"><span class="legend-dot" style="background:' + x.color + '"></span>' + U.esc(x.label) + ' <b class="seq-num">' + x.value + '</b></div>';
    });
    legend += '</div>';
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img">' + paths +
      '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" class="chart-center">' + total + '</text></svg>' + legend + '</div>';
  },

  bars(items, opts) {
    opts = opts || {};
    const max = Math.max(1, ...items.map(x => x.value));
    const H = opts.height || 160, bw = opts.barWidth || 34;
    const w = Math.max(items.length * (bw + 18) + 20, 160);
    let bars = '';
    items.forEach((x, i) => {
      const h = Math.round((x.value / max) * (H - 40));
      const bx = 14 + i * (bw + 18);
      bars += '<g><rect x="' + bx + '" y="' + (H - 24 - h) + '" width="' + bw + '" height="' + h + '" rx="4" fill="' + (x.color || 'var(--accent)') + '"><title>' + U.esc(x.label) + ': ' + x.value + '</title></rect>' +
        '<text x="' + (bx + bw / 2) + '" y="' + (H - 28 - h) + '" text-anchor="middle" class="chart-val">' + x.value + '</text>' +
        '<text x="' + (bx + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="chart-label">' + U.esc(U.truncate(x.label, 10)) + '</text></g>';
    });
    return '<div class="chart-wrap" style="overflow-x:auto"><svg viewBox="0 0 ' + w + ' ' + H + '" width="' + w + '" height="' + H + '" role="img">' + bars + '</svg></div>';
  },

  line(points, opts) {
    opts = opts || {};
    const W = opts.width || 480, H = opts.height || 150, pad = 28;
    if (!points.length) return '<div class="empty-state small">' + t('noData') + '</div>';
    const max = Math.max(1, ...points.map(p => p.value));
    const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
    let path = '', dots = '', labels = '';
    points.forEach((p, i) => {
      const x = pad + i * step;
      const y = H - 24 - (p.value / max) * (H - 44);
      path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5" fill="var(--accent)"><title>' + U.esc(p.label) + ': ' + p.value + '</title></circle>';
      if (points.length <= 14 || i % Math.ceil(points.length / 12) === 0) {
        labels += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="chart-label">' + U.esc(U.truncate(p.label, 8)) + '</text>';
      }
    });
    return '<div class="chart-wrap" style="overflow-x:auto"><svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img">' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' + dots + labels + '</svg></div>';
  }
};
