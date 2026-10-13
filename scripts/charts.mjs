// 把 data/task1-charts.json 里的图表数据画成 SVG 或表格（构建时运行）。
// 颜色、字号都用 class，由网页的 CSS 决定，深浅色主题下都能看清。

import fs from 'node:fs';
import path from 'node:path';

const W = 640;
const DASH = ['', '8 4', '2 4', '9 3 2 3', '4 3', '12 4'];
const MARKS = ['circle', 'square', 'triangle', 'diamond', 'down', 'circle'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r1 = (n) => Math.round(n * 10) / 10;
const textW = (s, size = 12) => String(s).length * size * 0.56;

function fmtNum(v) {
  if (v == null) return '';
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US');
  return String(Math.round(v * 100) / 100);
}

function niceScale(lo, hi) {
  const range = hi - lo || 1;
  const rough = range / 5;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough);
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

function scaleFor(spec, values) {
  const vals = values.filter((v) => v != null);
  const auto = niceScale(Math.min(0, ...vals), Math.max(...vals));
  return { min: spec.yMin ?? auto.min, max: spec.yMax ?? auto.max, step: spec.yStep ?? auto.step };
}

function ticks(sc) {
  const out = [];
  const n = Math.round((sc.max - sc.min) / sc.step);
  for (let i = 0; i <= n; i++) out.push(sc.min + i * sc.step);
  return out;
}

const tickLabel = (v, unit) => fmtNum(Math.round(v * 1000) / 1000) + (unit === '%' ? '%' : '');

function legendLayout(names, width, size = 12) {
  const items = [];
  let x = 0;
  let row = 0;
  names.forEach((name) => {
    const w = 30 + textW(name, size) + 18;
    if (x > 0 && x + w > width) {
      row += 1;
      x = 0;
    }
    items.push({ name, x, row, w });
    x += w;
  });
  const rows = row + 1;
  const rowWidths = Array.from({ length: rows }, (_, r) => items.filter((it) => it.row === r).reduce((s, it) => s + it.w, 0));
  items.forEach((it) => (it.x += (width - rowWidths[it.row]) / 2));
  return { items, height: rows * 22 };
}

function marker(kind, x, y, k) {
  const c = `ch-mk s${k % 6}`;
  if (kind === 'square') return `<rect class="${c}" x="${r1(x - 3.5)}" y="${r1(y - 3.5)}" width="7" height="7"/>`;
  if (kind === 'triangle') return `<path class="${c}" d="M${r1(x)} ${r1(y - 4.5)}L${r1(x + 4.5)} ${r1(y + 3.5)}L${r1(x - 4.5)} ${r1(y + 3.5)}Z"/>`;
  if (kind === 'down') return `<path class="${c}" d="M${r1(x)} ${r1(y + 4.5)}L${r1(x + 4.5)} ${r1(y - 3.5)}L${r1(x - 4.5)} ${r1(y - 3.5)}Z"/>`;
  if (kind === 'diamond') return `<path class="${c}" d="M${r1(x)} ${r1(y - 5)}L${r1(x + 5)} ${r1(y)}L${r1(x)} ${r1(y + 5)}L${r1(x - 5)} ${r1(y)}Z"/>`;
  return `<circle class="${c}" cx="${r1(x)}" cy="${r1(y)}" r="3.8"/>`;
}

function legendSvg(layout, x0, y0, kind) {
  return layout.items
    .map((it, k) => {
      const x = x0 + it.x;
      const y = y0 + it.row * 22 + 11;
      const sw =
        kind === 'line'
          ? `<line class="ch-line s${k % 6}" x1="${r1(x)}" x2="${r1(x + 24)}" y1="${y}" y2="${y}" stroke-dasharray="${DASH[k % 6]}"/>${marker(MARKS[k % 6], x + 12, y, k)}`
          : `<rect class="ch-bar s${k % 6}" x="${r1(x + 4)}" y="${y - 6}" width="16" height="12" rx="2"/>`;
      return `${sw}<text class="ch-legend" x="${r1(x + 30)}" y="${y + 4}">${esc(it.name)}</text>`;
    })
    .join('');
}

function svgWrap(h, title, body, label) {
  const t = title ? `<text class="ch-title" x="${W / 2}" y="20" text-anchor="middle">${esc(title)}</text>` : '';
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label || title || 'chart')}">${t}${body}</svg>`;
}

function wrapLabel(s, maxChars) {
  if (s.length <= maxChars) return [s];
  const words = s.split(' ');
  const lines = [''];
  words.forEach((w) => {
    const cur = lines[lines.length - 1];
    if (cur && (cur + ' ' + w).length > maxChars) lines.push(w);
    else lines[lines.length - 1] = cur ? cur + ' ' + w : w;
  });
  return lines;
}

function frame(spec, sc, xLabelLines) {
  const maxTick = Math.max(...ticks(sc).map((v) => tickLabel(v, spec.unit).length));
  const left = (spec.yLabel ? 22 : 6) + 10 + maxTick * 6.6;
  const top = spec.title ? 36 : 12;
  const names = spec.series.length > 1 && spec.legend !== false ? spec.series.map((s) => s.name) : [];
  const legend = names.length ? legendLayout(names, W - left - 16) : null;
  const bottom = 10 + xLabelLines * 15 + (legend ? legend.height + 12 : 4);
  const h = spec.height || 330;
  return { left, top, right: 16, bottom, h, pw: W - left - 16, ph: h - top - bottom, legend };
}

function yAxis(spec, sc, f) {
  const yAt = (v) => f.top + f.ph - ((v - sc.min) / (sc.max - sc.min)) * f.ph;
  let g = '';
  ticks(sc).forEach((v) => {
    const y = r1(yAt(v));
    g += `<line class="ch-grid" x1="${r1(f.left)}" x2="${r1(f.left + f.pw)}" y1="${y}" y2="${y}"/>`;
    g += `<text class="ch-tick" x="${r1(f.left - 8)}" y="${y + 4}" text-anchor="end">${tickLabel(v, spec.unit)}</text>`;
  });
  if (spec.yLabel) g += `<text class="ch-tick" transform="translate(13 ${r1(f.top + f.ph / 2)}) rotate(-90)" text-anchor="middle">${esc(spec.yLabel)}</text>`;
  g += `<line class="ch-axis" x1="${r1(f.left)}" x2="${r1(f.left + f.pw)}" y1="${r1(f.top + f.ph)}" y2="${r1(f.top + f.ph)}"/>`;
  return { g, yAt };
}

function lineChart(spec) {
  const sc = scaleFor(spec, spec.series.flatMap((s) => s.values));
  const f = frame(spec, sc, 1);
  const { g: axis, yAt } = yAxis(spec, sc, f);
  const n = spec.x.length;
  const xAt = (i) => f.left + (f.pw * (i + 0.5)) / n;
  let g = axis;
  spec.x.forEach((lab, i) => {
    g += `<text class="ch-tick" x="${r1(xAt(i))}" y="${r1(f.top + f.ph + 17)}" text-anchor="middle">${esc(lab)}</text>`;
  });
  spec.series.forEach((s, k) => {
    const pts = s.values.map((v, i) => (v == null ? null : [xAt(i), yAt(v)]));
    g += `<polyline class="ch-line s${k % 6}" points="${pts.filter(Boolean).map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ')}" stroke-dasharray="${DASH[k % 6]}"/>`;
    pts.forEach((p) => p && (g += marker(MARKS[k % 6], p[0], p[1], k)));
  });
  if (f.legend) g += legendSvg(f.legend, f.left, f.h - f.legend.height - 6, 'line');
  return svgWrap(f.h, spec.title, g);
}

function barChart(spec) {
  if (spec.horizontal) return hBarChart(spec);
  const sc = scaleFor(spec, spec.series.flatMap((s) => s.values));
  const nCat = spec.categories.length;
  const maxChars = Math.max(8, Math.floor((W - 80) / nCat / 7));
  const labelLines = Math.max(...spec.categories.map((c) => wrapLabel(String(c), maxChars).length));
  const f = frame(spec, sc, labelLines);
  const { g: axis, yAt } = yAxis(spec, sc, f);
  const gw = f.pw / nCat;
  const inner = gw * (spec.series.length > 1 ? 0.8 : 0.6);
  const bw = inner / spec.series.length;
  let g = axis;
  spec.categories.forEach((c, i) => {
    wrapLabel(String(c), maxChars).forEach((line, j) => {
      g += `<text class="ch-tick" x="${r1(f.left + gw * (i + 0.5))}" y="${r1(f.top + f.ph + 17 + j * 15)}" text-anchor="middle">${esc(line)}</text>`;
    });
    spec.series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null || v === 0) return;
      const x = f.left + gw * i + (gw - inner) / 2 + k * bw;
      const y = yAt(Math.max(v, sc.min));
      const base = yAt(sc.min);
      g += `<rect class="ch-bar s${k % 6}" x="${r1(x + 1)}" y="${r1(y)}" width="${r1(Math.max(bw - 2, 2))}" height="${r1(Math.max(base - y, 0))}"/>`;
      if (spec.labels) g += `<text class="ch-val" x="${r1(x + bw / 2)}" y="${r1(y - 4)}" text-anchor="middle">${fmtNum(v)}</text>`;
    });
  });
  if (f.legend) g += legendSvg(f.legend, f.left, f.h - f.legend.height - 6, 'bar');
  return svgWrap(f.h, spec.title, g);
}

function hBarChart(spec) {
  const sc = scaleFor(spec, spec.series.flatMap((s) => s.values));
  const left = 12 + Math.max(...spec.categories.map((c) => textW(c, 12.5)));
  const top = spec.title ? 36 : 12;
  const names = spec.series.length > 1 ? spec.series.map((s) => s.name) : [];
  const legend = names.length ? legendLayout(names, W - left - 20) : null;
  const rowH = spec.series.length * 15 + 14;
  const ph = spec.categories.length * rowH;
  const h = top + ph + 28 + (spec.xLabel ? 16 : 0) + (legend ? legend.height + 10 : 0);
  const pw = W - left - 20;
  const xAt = (v) => left + ((v - sc.min) / (sc.max - sc.min)) * pw;
  let g = '';
  ticks(sc).forEach((v) => {
    const x = r1(xAt(v));
    g += `<line class="ch-grid" x1="${x}" x2="${x}" y1="${top}" y2="${top + ph}"/>`;
    g += `<text class="ch-tick" x="${x}" y="${top + ph + 16}" text-anchor="middle">${tickLabel(v, spec.unit)}</text>`;
  });
  g += `<line class="ch-axis" x1="${r1(left)}" x2="${r1(left)}" y1="${top}" y2="${top + ph}"/>`;
  if (spec.xLabel) g += `<text class="ch-tick" x="${r1(left + pw / 2)}" y="${top + ph + 32}" text-anchor="middle">${esc(spec.xLabel)}</text>`;
  spec.categories.forEach((c, i) => {
    const y0 = top + i * rowH + 7;
    g += `<text class="ch-tick ch-cat" x="${r1(left - 8)}" y="${r1(y0 + (rowH - 14) / 2 + 4)}" text-anchor="end">${esc(c)}</text>`;
    spec.series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null) return;
      const y = y0 + k * 15;
      g += `<rect class="ch-bar s${k % 6}" x="${r1(left)}" y="${r1(y)}" width="${r1(Math.max(xAt(v) - left, 1))}" height="13"/>`;
      if (spec.labels) g += `<text class="ch-val" x="${r1(xAt(v) + 4)}" y="${r1(y + 10)}">${fmtNum(v)}</text>`;
    });
  });
  if (legend) g += legendSvg(legend, left, h - legend.height - 4, 'bar');
  return svgWrap(h, spec.title, g);
}

function pieChart(spec) {
  const n = spec.pies.length;
  const r = n >= 3 ? 80 : n === 2 ? 98 : 118;
  const top = spec.title ? 36 : 10;
  const cy = top + 26 + r;
  const legend = legendLayout(spec.names, W - 40);
  const h = cy + r + 18 + legend.height + 8;
  let g = '';
  spec.pies.forEach((pie, i) => {
    const cx = (W * (i + 0.5)) / n;
    const sum = pie.values.reduce((a, b) => a + b, 0);
    g += `<text class="ch-subtitle" x="${r1(cx)}" y="${top + 14}" text-anchor="middle">${esc(pie.title)}</text>`;
    let a0 = -Math.PI / 2;
    pie.values.forEach((v, k) => {
      if (!v) return;
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      const [x0, y0] = p(a0, r);
      const [x1, y1] = p(a1, r);
      g += `<path class="ch-bar ch-slice s${k % 6}" d="M${r1(cx)} ${r1(cy)}L${r1(x0)} ${r1(y0)}A${r} ${r} 0 ${large} 1 ${r1(x1)} ${r1(y1)}Z"/>`;
      const mid = (a0 + a1) / 2;
      const inside = v / sum >= 0.07;
      const [lx, ly] = p(mid, inside ? r * 0.64 : r + 14);
      const anchor = inside ? 'middle' : Math.cos(mid) >= 0 ? 'start' : 'end';
      g += `<text class="${inside ? 'ch-pie-in' : 'ch-pie-out'}" x="${r1(lx)}" y="${r1(ly + 4)}" text-anchor="${anchor}">${fmtNum(v)}${spec.unit ?? '%'}</text>`;
      a0 = a1;
    });
  });
  g += legendSvg(legend, 20, h - legend.height - 4, 'bar');
  return svgWrap(h, spec.title, g);
}

function tableHtml(spec, extraClass = '') {
  const head = spec.head ? `<thead><tr>${spec.head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '';
  const body = spec.rows.map((row) => `<tr>${row.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('');
  return `<div class="chart-table-wrap ${extraClass}">${spec.title ? `<p class="chart-subtitle">${esc(spec.title)}</p>` : ''}<table class="chart-table">${head}<tbody>${body}</tbody></table></div>`;
}

export function renderChart(spec, root) {
  switch (spec.type) {
    case 'line':
      return `<div class="chart-scroll">${lineChart(spec)}</div>`;
    case 'bar':
      return `<div class="chart-scroll">${barChart(spec)}</div>`;
    case 'pie':
      return `<div class="chart-scroll">${pieChart(spec)}</div>`;
    case 'table':
      return tableHtml(spec);
    case 'group':
      return `<div class="chart-group">${spec.title ? `<p class="chart-group-title">${esc(spec.title)}</p>` : ''}${spec.parts.map((p) => renderChart(p, root)).join('')}</div>`;
    case 'svg':
      return `<div class="chart-scroll">${fs.readFileSync(path.join(root, spec.file), 'utf8').trim()}</div>`;
    default:
      throw new Error(`未知图表类型：${spec.type}`);
  }
}

// 给 AI 批改用的文字版数据
export function chartText(spec) {
  const unit = spec.unit === '%' ? '%' : '';
  switch (spec.type) {
    case 'line':
      return [spec.title, spec.yLabel && `Unit: ${spec.yLabel}`, `Categories: ${spec.x.join(', ')}`, ...spec.series.map((s) => `${s.name}: ${s.values.map((v) => fmtNum(v) + unit).join(', ')}`)].filter(Boolean).join('\n');
    case 'bar':
      return [spec.title, spec.yLabel && `Unit: ${spec.yLabel}`, `Categories: ${spec.categories.join(', ')}`, ...spec.series.map((s) => `${s.name}: ${s.values.map((v) => fmtNum(v ?? 0) + unit).join(', ')}`)].filter(Boolean).join('\n');
    case 'pie':
      return [spec.title, ...spec.pies.map((p) => `${p.title}: ${p.values.map((v, i) => `${spec.names[i]} ${fmtNum(v)}${spec.unit ?? '%'}`).join(', ')}`)].join('\n');
    case 'table':
      return [spec.title, spec.head && spec.head.join(' | '), ...spec.rows.map((r) => r.join(' | '))].filter(Boolean).join('\n');
    case 'group':
      return [spec.title, ...spec.parts.map(chartText)].filter(Boolean).join('\n\n');
    case 'svg':
      return spec.desc;
    default:
      return '';
  }
}

// 折线、柱状、饼图下面可展开的数据表
export function dataTable(spec) {
  if (spec.type === 'line' || spec.type === 'bar') {
    const cats = spec.x || spec.categories;
    const unit = spec.unit === '%' ? '%' : '';
    return tableHtml({ head: ['', ...cats], rows: spec.series.map((s) => [s.name, ...s.values.map((v) => (v == null ? '' : fmtNum(v) + unit))]) }, 'compact');
  }
  if (spec.type === 'pie') return tableHtml({ head: ['', ...spec.pies.map((p) => p.title)], rows: spec.names.map((n, i) => [n, ...spec.pies.map((p) => fmtNum(p.values[i]) + (spec.unit ?? '%'))]) }, 'compact');
  if (spec.type === 'group') return spec.parts.map(dataTable).filter(Boolean).join('');
  return '';
}
