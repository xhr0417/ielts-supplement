// 生成网页和 Markdown：node scripts/build.mjs
//
// 输入：data/*.json、笔记/作文/做题技巧/*.md、原作者笔记/**/*.md、site-src/
// 输出：site/index.html（单文件，离线可用）
//       笔记/口语/P1|P2|P3/新题_2026年9-12月.md、笔记/作文/近期真题_2026年9-10月.md

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import { chartText, dataTable, renderChart } from './charts.mjs';
import { authorPages, supplementPages, writingTypes } from './site.config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), s);
};

const speaking = JSON.parse(read('data/speaking-2026-09.json'));
const recent = JSON.parse(read('data/writing-recent-2026.json'));
const task1Charts = JSON.parse(read('data/task1-charts.json'));

const warnings = [];

// 每道真题一个稳定的 id，写作草稿按它存在浏览器里
const qid = (q) => crypto.createHash('sha1').update(q).digest('hex').slice(0, 10);
recent.task2.forEach((q) => (q.id = qid(q.q)));
recent.task1.forEach((q) => {
  q.id = qid(q.q);
  if (!q.chart) return;
  const spec = task1Charts.charts[q.chart];
  if (!spec) {
    warnings.push(`小作文图表不存在：${q.chart}`);
    return;
  }
  q.chartHtml = renderChart(spec, root);
  q.chartData = chartText(spec);
  q.chartTable = dataTable(spec);
  if (q.img) q.imgUrl = task1Charts.imageBase + q.img;
});

// ---------- Markdown 页面 ----------

const markExtension = {
  name: 'mark',
  level: 'inline',
  start(src) {
    const i = src.indexOf('==');
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
    if (m) return { type: 'mark', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
  }
};
// 原作者用 Obsidian 写笔记，单个换行要保留成换行
const marked = new Marked({ gfm: true, breaks: true });
marked.use({ extensions: [markExtension] });

const pageDefs = [
  ...authorPages.map((p) => ({ ...p, origin: 'author' })),
  ...supplementPages.map((p) => ({ ...p, origin: 'supplement' }))
];
const defByFile = new Map(pageDefs.map((p) => [p.file, p]));
const typeByPrimaryPage = new Map(writingTypes.map((t) => [t.pages[0], t.id]));
const routeFor = (id) => (typeByPrimaryPage.has(id) ? `#/w/${typeByPrimaryPage.get(id)}` : `#/page/${id}`);

const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decodeEntities = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => entities[m]);
const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, '')).trim();
const plain = (html) => stripTags(html.replace(/<(br|\/p|\/li|\/tr|\/h\d|\/td|\/th)[^>]*>/g, ' ')).replace(/\s+/g, ' ');

function rewriteLink(href, fromFile) {
  const raw = decodeEntities(href);
  if (/^https?:/.test(raw)) return `<a href="${href}" target="_blank" rel="noopener"`;
  if (/^(#|mailto:)/.test(raw)) return `<a href="${href}"`;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decodeURIComponent(raw.split('#')[0])));
  const def = defByFile.get(target);
  if (def) return `<a href="${routeFor(def.id)}"`;
  warnings.push(`链接找不到页面：${fromFile} → ${raw}`);
  return `<a href="#/"`;
}

// 原作者用空行分隔模板分组：首尾的空行去掉，中间连续的空行合并成一个间隔行。
function tidyTables(html) {
  const isEmptyRow = (inner) => /^(?:\s*<td[^>]*>(?:\s|<br\s*\/?>|&nbsp;)*<\/td>)+\s*$/.test(inner);
  return html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<tbody>([\s\S]*?)<\/tbody>/g, (m, body) => {
      const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => r[1]);
      const out = [];
      rows.forEach((inner) => {
        const gap = isEmptyRow(inner);
        if (gap && (!out.length || out[out.length - 1].gap)) return;
        out.push({ gap, inner });
      });
      while (out.length && out[out.length - 1].gap) out.pop();
      return `<tbody>${out.map((r) => (r.gap ? `<tr class="gap">${r.inner}</tr>` : `<tr>${r.inner}</tr>`)).join('\n')}</tbody>`;
    });
}

function groupOf(file) {
  const m = /^原作者笔记\/(口语\/P[123]|作文)/.exec(file);
  if (!m) return 'supplement';
  return { '口语/P1': 'a-p1', '口语/P2': 'a-p2', '口语/P3': 'a-p3', '作文': 'a-w' }[m[1]];
}

function renderPage(def) {
  let html = marked.parse(read(def.file));
  let title = def.title;
  html = html.replace(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>\s*/, (m, inner) => {
    title = title || stripTags(inner);
    return '';
  });
  html = html.replace(/<a href="([^"]*)"/g, (m, href) => rewriteLink(href, def.file));
  const toc = [];
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (m, level, inner) => {
    const id = `h${toc.length + 1}`;
    toc.push({ level: Number(level), id, text: stripTags(inner) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  html = tidyTables(html);
  return {
    id: def.id,
    origin: def.origin,
    group: groupOf(def.file),
    file: def.file,
    title: title || path.basename(def.file, '.md'),
    html,
    toc,
    text: plain(html)
  };
}

const pages = pageDefs.map(renderPage);

// ---------- 从 JSON 生成 Markdown ----------

const hot1 = new Set(speaking.hot.p1);
const hot2 = new Set(speaking.hot.p2);
const pageById = new Map(pageDefs.map((p) => [p.id, p]));
const mdLink = (text, file) => `[${text}](<${file}>)`;
const relTo = (dir, file) => path.posix.relative(dir, file);
const shortNames = (src, sources) => src.map((s) => sources[s]?.short || s).join(' · ');

function tagText(item, hot) {
  const t = [];
  if (item.tags?.includes('mainland')) t.push('`大陆新题`');
  if (item.tags?.includes('later')) t.push('`后续新增`');
  if (hot.has(item.id)) t.push('`近期高频`');
  return t.length ? ' ' + t.join(' ') : '';
}

function seeLinks(see, dir) {
  return (see || []).map((id) => mdLink(pageById.get(id).title, relTo(dir, pageById.get(id).file))).join('、');
}

const generatedNote = (extra) =>
  `> 这份文件由 \`data/${extra}\` 生成（\`node scripts/build.mjs\`），更新于 ${speaking.updated}。要改内容请改 JSON。网页版见 \`site/index.html\`。\n`;

function p1Markdown() {
  const dir = '笔记/口语/P1';
  const S = speaking.sources;
  const lines = [
    `# Part 1 新题（${speaking.season}）`,
    '',
    generatedNote('speaking-2026-09.json'),
    '标记：`大陆新题` 是新东方标注的大陆考区新题；`后续新增` 是 9 月中旬以后才报告或进入高频的话题；`近期高频` 是考情周报里 ' + speaking.hot.range + ' 考到次数最多的 10 个话题。',
    '',
    '题目为考生回忆整理，英文以考场为准，中文为对照翻译。',
    '',
    `## 近期高频（${speaking.hot.range}）`,
    '',
    speaking.hot.p1
      .map((id) => {
        const t = speaking.p1.find((x) => x.id === id) || speaking.core.find((x) => x.id === id);
        return `${t.en}（${t.zh}）`;
      })
      .join(' · '),
    '',
    '## 必考',
    '',
    speaking.core.map((c) => `- ${c.en}（${c.zh}）：见原作者 ${seeLinks(c.see, dir)}`).join('\n'),
    ''
  ];
  speaking.p1.forEach((t, i) => {
    lines.push('---', '', `### ${i + 1}. ${t.en}（${t.zh}）${tagText(t, hot1)}`, '', '| 英文 | 中文 |', '|---|---|');
    t.qs.forEach(([en, zh]) => lines.push(`| ${en} | ${zh} |`));
    lines.push('', `**思路**：${t.tip}`);
    if (t.see) lines.push('', `原作者素材：${seeLinks(t.see, dir)}`);
    if (t.note) lines.push('', `> ${t.note}`);
    lines.push('', `来源：${shortNames(t.src, S)}`, '');
  });
  lines.push('---', '', '## 海外考区专属（大陆可忽略）', '', ...speaking.p1Overseas.map((t) => `- ${t.en}（${t.zh}）`), '');
  return lines.join('\n');
}

function p2Markdown() {
  const dir = '笔记/口语/P2';
  const S = speaking.sources;
  const no = new Map(speaking.p2.map((c, i) => [c.id, i + 1]));
  const lines = [
    `# Part 2 新题（${speaking.season}）`,
    '',
    generatedNote('speaking-2026-09.json'),
    `共 ${speaking.p2.length} 张卡，按人物、地点、物品、事件分组。标记含义同 P1 文件。每张卡的 Part 3 追问见 [P3 文件](<../P3/新题_2026年9-12月.md>)，序号一致。`,
    '',
    '和上一版相比：新东方的“想要了解更多的人”和 Chelsea 的“一见且想继续了解的人”合并为一张卡；“不喜欢但经常去的地方”并入“经常去但不喜欢的短途旅行”；新增 9 月中旬以后报告的 5 张卡（公共场所丢东西、节省时间的方法、有健康作息的人、读起来开心的书、帮别人解决问题）。',
    '',
    `## 近期高频（${speaking.hot.range}）`,
    '',
    speaking.hot.p2.map((id) => `#${no.get(id)} ${speaking.p2.find((c) => c.id === id).zh}`).join(' · '),
    '',
    '## 串题：哪些题可以用同一个故事',
    '',
    '同一个故事可以对应多道题，但 Part 3 的追问会变，所以还要准备观点。',
    '',
    '| 素材 | 可以共用的题 | 故事建议 |',
    '|---|---|---|'
  ];
  speaking.chuanti.forEach((g) => {
    lines.push(`| ${g.title} | ${g.cards.map((id) => `#${no.get(id)} ${speaking.p2.find((c) => c.id === id).zh}`).join(' · ')} | ${g.story} |`);
  });
  lines.push('');
  for (const [cat, label] of Object.entries(speaking.categories)) {
    lines.push('---', '', `## ${label}类`, '');
    speaking.p2
      .filter((c) => c.cat === cat)
      .forEach((c) => {
        lines.push(`### ${no.get(c.id)}. ${c.zh}${tagText(c, hot2)}`, '', `*${c.en}*`, '');
        if (c.alias) lines.push(`其他叫法：${c.alias}`, '');
        lines.push('You should say:', '', ...c.say.map((s) => `- ${s}`), '');
        lines.push(`**思路 / 串题**：${c.tip}`, '');
        if (c.see) lines.push(`原作者有相关答案：${seeLinks(c.see, dir)}`, '');
        if (c.note) lines.push(`> ${c.note}`, '');
        lines.push(`来源：${shortNames(c.src, S)}`, '');
      });
  }
  lines.push('---', '', '## 海外考区专属（大陆可忽略）', '', ...speaking.p2Overseas.map((c) => `- ${c.zh}（中译英：*${c.en}*）`), '');
  return lines.join('\n');
}

function p3Markdown() {
  const lines = [
    `# Part 3 新题（${speaking.season}）`,
    '',
    generatedNote('speaking-2026-09.json'),
    '按 Part 2 题卡分组，序号和 P2 文件一致。Part 3 从 Part 2 的话题延伸到社会、教育、科技、工作等更大的话题，回答结构可以参考原作者的 [P3 万能框架](<../../../原作者笔记/口语/P3/0-必备.md>)。',
    ''
  ];
  speaking.p2.forEach((c, i) => {
    lines.push(`### ${i + 1}. ${c.zh}`, '', `*${c.en}*`, '', ...c.p3.map((q) => `- ${q}`), '');
  });
  return lines.join('\n');
}

function recentMarkdown() {
  const S = recent.sources;
  const flagText = (f) => (f || []).map((x) => ({ repeat: '`近期重复`', recycled: '`往年旧题`' })[x]).join(' ');
  const lines = [
    '# 近期写作真题（2026 年 9–10 月）',
    '',
    `> 这份文件由 \`data/writing-recent-2026.json\` 生成，更新于 ${recent.updated}。题目是考生考后回忆，不是官方发布，措辞可能有出入。`,
    '',
    `范围：${recent.range}。\`近期重复\` 表示最近三个月有两次以上考生报告，\`往年旧题\` 表示以前考过。`,
    '',
    '## 大作文',
    ''
  ];
  for (const [type, label] of Object.entries(recent.task2Types)) {
    const items = recent.task2.filter((q) => q.type === type);
    if (!items.length) continue;
    const tpl = writingTypes.find((t) => t.recent === type);
    lines.push(`### ${label}（${items.length} 道）`, '', `模板：${mdLink(pageById.get(tpl.pages[0]).title || label, relTo('笔记/作文', pageById.get(tpl.pages[0]).file))}`, '');
    items.forEach((q) => {
      lines.push(`- **${q.week}**${q.parts ? `（${q.parts}）` : ''} ${q.q} ${flagText(q.flags)}`.trimEnd());
      lines.push(`  - ${q.zh}${q.note ? `（${q.note}）` : ''}`);
    });
    lines.push('');
  }
  const withChart = recent.task1.filter((q) => q.chart).length;
  lines.push('## 小作文', '', `${recent.task1.length} 道里有 ${withChart} 道配了图：网页版按原图数据重绘了图表，可以直接看图写作；下面的“原图”链接指向来源网站的图片。`, '');
  for (const [type, label] of Object.entries(recent.task1Types)) {
    const items = recent.task1.filter((q) => q.type === type);
    if (!items.length) continue;
    lines.push(`### ${label}（${items.length} 道）`, '');
    items.forEach((q) => {
      lines.push(`- **${q.week}** ${q.q} ${flagText(q.flags)}${q.note ? `（${q.note}）` : ''}`.trimEnd());
      lines.push(q.imgUrl ? `  - [原图](${q.imgUrl})` : '  - 来源暂时没有这道题的图');
    });
    lines.push('');
  }
  lines.push('## 来源', '', ...Object.values(S).map((s) => `- ${s.name}（${s.date}）：${s.url}`), '');
  return lines.join('\n');
}

write('笔记/口语/P1/新题_2026年9-12月.md', p1Markdown());
write('笔记/口语/P2/新题_2026年9-12月.md', p2Markdown());
write('笔记/口语/P3/新题_2026年9-12月.md', p3Markdown());
write('笔记/作文/近期真题_2026年9-10月.md', recentMarkdown());

// ---------- 网页 ----------

const data = {
  built: new Date().toISOString().slice(0, 10),
  repo: 'https://github.com/xhr0417/ielts-supplement',
  authorRepo: 'https://github.com/flamingoTOM/lxy_ILETS',
  speaking,
  recent,
  writingTypes,
  pages
};

const template = read('site-src/index.html');
const html = template
  .replace('/*__STYLE__*/', () => read('site-src/style.css'))
  .replace('/*__APP__*/', () => read('site-src/app.js'))
  .replace('"__DATA__"', () => JSON.stringify(data).replace(/</g, '\\u003c'));
write('site/index.html', html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`页面 ${pages.length} 篇，P1 ${speaking.p1.length} 个话题，P2 ${speaking.p2.length} 张卡，真题 ${recent.task2.length + recent.task1.length} 道`);
console.log(`写入 site/index.html（${kb} KB）和 4 份 Markdown`);
if (warnings.length) {
  console.warn(warnings.join('\n'));
  process.exitCode = 1;
}
