(function () {
  'use strict';

  const DATA = JSON.parse(document.getElementById('site-data').textContent);
  const S = DATA.speaking;
  const R = DATA.recent;
  const TYPES = DATA.writingTypes;
  const pages = new Map(DATA.pages.map((p) => [p.id, p]));
  const p1ById = new Map(S.p1.map((t) => [t.id, t]));
  const p2ById = new Map(S.p2.map((c) => [c.id, c]));
  const coreById = new Map(S.core.map((c) => [c.id, c]));
  const typeById = new Map(TYPES.map((t) => [t.id, t]));
  const typeByRecent = new Map(TYPES.map((t) => [t.recent, t]));
  const hot1 = new Set(S.hot.p1);
  const hot2 = new Set(S.hot.p2);
  const p1No = new Map(S.p1.map((t, i) => [t.id, i + 1]));
  const p2No = new Map(S.p2.map((c, i) => [c.id, i + 1]));
  const totalP3 = S.p2.reduce((n, c) => n + c.p3.length, 0);
  const authorPages = DATA.pages.filter((p) => p.origin === 'author');

  const main = document.getElementById('main');
  const sidebar = document.getElementById('sidebar');
  const tocEl = document.getElementById('toc');
  const searchInput = document.getElementById('searchInput');

  // ---------- 工具 ----------

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const localDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${y} 年 ${m} 月 ${d} 日`;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  let toastTimer = 0;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- 本机存储 ----------

  const PREFIX = 'ielts26:';
  let storageOk = true;
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      storageOk = false;
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      storageOk = false;
      return false;
    }
  }

  const done = load('done', {});
  const isDone = (key) => Boolean(done[key]);
  function setDone(key, on) {
    if (on) done[key] = localDate();
    else delete done[key];
    if (!save('done', done)) toast('浏览器不允许保存，刷新后标记会丢失');
    document.querySelectorAll(`[data-done="${key}"]`).forEach(paintDone);
    updateCounts();
  }
  const doneBtn = (key) =>
    `<button class="done-btn" type="button" data-done="${key}" aria-pressed="${isDone(key)}">${isDone(key) ? '练过' : '标记练过'}</button>`;
  function paintDone(btn) {
    const on = isDone(btn.dataset.done);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '练过' : '标记练过';
  }
  const countDone = (kind, list) => list.filter((x) => isDone(`${kind}:${x.id}`)).length;
  function updateCounts() {
    document.querySelectorAll('[data-count]').forEach((el) => {
      const kind = el.dataset.count;
      const list = kind === 'p1' ? S.p1 : S.p2;
      el.textContent = `${countDone(kind, list)} / ${list.length}`;
    });
  }

  // ---------- 考试倒计时 ----------

  const DEFAULT_EXAM = '2026-10-18';
  function examInfo() {
    const d = load('exam', DEFAULT_EXAM);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const [y, m, dd] = d.split('-').map(Number);
    const now = new Date();
    const days = Math.round((new Date(y, m - 1, dd) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const md = `${m} 月 ${dd} 日`;
    if (days > 0) return { date: d, big: days, label: `天后考试 · ${md}`, chip: `距考试 ${days} 天`, upcoming: true };
    if (days === 0) return { date: d, big: '今天', label: `考试日 · ${md}`, chip: '今天考试', upcoming: true };
    return { date: d, big: -days, label: `天前考过 · ${md}`, chip: `${md} 已考`, upcoming: false };
  }
  const examBtn = document.getElementById('examBtn');
  const examDialog = document.getElementById('examDialog');
  function paintExam() {
    const info = examInfo();
    examBtn.textContent = info ? info.chip : '设考试日期';
    examBtn.classList.toggle('on', Boolean(info && info.upcoming));
  }
  examBtn.addEventListener('click', () => {
    const input = document.getElementById('examDate');
    input.value = load('exam', DEFAULT_EXAM) || '';
    examDialog.returnValue = '';
    if (typeof examDialog.showModal === 'function') examDialog.showModal();
    else {
      const v = prompt('考试日期（例如 2026-10-18），留空表示不显示倒计时', input.value);
      if (v !== null) {
        save('exam', v.trim());
        paintExam();
        render();
      }
    }
  });
  examDialog.addEventListener('close', () => {
    const v = examDialog.returnValue;
    if (v === 'save') save('exam', document.getElementById('examDate').value);
    if (v === 'clear') save('exam', '');
    if (v === 'save' || v === 'clear') {
      paintExam();
      if (current().path === '/') render();
    }
  });

  // ---------- 主题 ----------

  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(PREFIX + 'theme', next);
    } catch (e) {}
  });

  // ---------- 链接和标签 ----------

  const typeByPrimaryPage = new Map(TYPES.map((t) => [t.pages[0], t.id]));
  const pageRoute = (id) => (typeByPrimaryPage.has(id) ? `#/w/${typeByPrimaryPage.get(id)}` : `#/page/${id}`);
  const pageLinks = (ids) =>
    (ids || [])
      .map((id) => pages.get(id))
      .filter(Boolean)
      .map((p) => `<a href="${pageRoute(p.id)}">${esc(p.title)}</a>`)
      .join('');
  const itemLinks = (ids) =>
    (ids || [])
      .map((id) => {
        if (p2ById.has(id)) return `<a href="#/p2?focus=${id}">P2 #${p2No.get(id)} ${esc(p2ById.get(id).zh)}</a>`;
        if (p1ById.has(id)) return `<a href="#/p1?focus=${id}">P1 ${esc(p1ById.get(id).en)}</a>`;
        return '';
      })
      .join('');
  const srcLine = (src, sources) => (src || []).map((s) => (sources[s] && sources[s].short) || s).join(' · ');

  function tagsFor(item, kind) {
    const t = [];
    if (item.tags && item.tags.includes('mainland')) t.push('<span class="tag tag-mainland">大陆新题</span>');
    if ((kind === 'p1' ? hot1 : hot2).has(item.id)) t.push('<span class="tag tag-hot">近期高频</span>');
    if (item.tags && item.tags.includes('later')) t.push('<span class="tag tag-later">后续新增</span>');
    return t.length ? `<span class="tags">${t.join('')}</span>` : '';
  }
  const originTag = (p) => (p.origin === 'author' ? '<span class="tag tag-author">原作者笔记</span>' : '<span class="tag">本站补充</span>');

  const FILTERS = [
    ['all', '全部'],
    ['mainland', '大陆新题'],
    ['hot', '近期高频'],
    ['later', '后续新增'],
    ['todo', '未练过']
  ];
  function matchFilter(item, f, kind) {
    if (f === 'all') return true;
    if (f === 'hot') return (kind === 'p1' ? hot1 : hot2).has(item.id);
    if (f === 'todo') return !isDone(`${kind}:${item.id}`);
    return Boolean(item.tags && item.tags.includes(f));
  }
  const segs = (name, options, value) =>
    options.map(([v, label]) => `<button class="seg" type="button" data-${name}="${v}" aria-pressed="${v === value}">${esc(label)}</button>`).join('');
  function bindSegs(root, name, onPick) {
    root.querySelectorAll(`[data-${name}]`).forEach((b) => {
      b.addEventListener('click', () => {
        root.querySelectorAll(`[data-${name}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        onPick(b.dataset[name]);
      });
    });
  }

  // ---------- 导航 ----------

  function navLink(href, label, count) {
    return `<a class="nav-link" href="${href}">${esc(label)}${count != null ? `<span class="count">${count}</span>` : ''}</a>`;
  }
  function navFold(label, count, inner, open, key) {
    return `<details class="nav-fold"${open ? ' open' : ''}${key ? ` data-fold="${key}"` : ''}><summary class="nav-sum">${esc(label)}<span class="count">${count}</span></summary><div class="nav-sub">${inner}</div></details>`;
  }
  function buildNav() {
    const t1 = TYPES.filter((t) => t.task === 1);
    const t2 = TYPES.filter((t) => t.task === 2);
    const authorGroup = (group, label) => {
      const list = authorPages.filter((p) => p.group === group);
      return navFold(label, list.length, list.map((p) => navLink(`#/page/${p.id}`, p.title)).join(''), false, group);
    };
    sidebar.innerHTML = `
      <div class="nav-group">${navLink('#/', '首页')}</div>
      <div class="nav-group">
        <p class="nav-title">口语 · ${esc(S.season)}</p>
        ${navLink('#/p1', 'Part 1 新题', S.p1.length)}
        ${navLink('#/p2', 'Part 2 题卡', S.p2.length)}
        ${navLink('#/p3', 'Part 3 追问', totalP3)}
        ${navLink('#/chuanti', '串题', S.chuanti.length)}
        ${navLink('#/practice', '计时练习')}
      </div>
      <div class="nav-group">
        <p class="nav-title">写作</p>
        ${navLink('#/writing', '题型速查')}
        ${navFold('小作文', t1.length, navLink('#/page/s-t1-overview', '总览：结构和时态') + t1.map((t) => navLink(`#/w/${t.id}`, t.name)).join(''), true)}
        ${navFold('大作文', t2.length, navLink('#/page/s-t2-overview', '总览：题型识别') + t2.map((t) => navLink(`#/w/${t.id}`, t.en)).join(''), true)}
        ${navLink('#/recent', '近期真题', R.task1.length + R.task2.length)}
        ${navLink('#/page/a-w-t1-vocab', '小作文通识积累')}
        ${navLink('#/page/a-w-t2-vocab', '大作文通识积累')}
        ${navLink('#/page/a-w-ai', 'AI 批改提示词')}
      </div>
      <div class="nav-group">
        <p class="nav-title">原作者笔记</p>
        ${navLink('#/notes', '说明和目录')}
        ${authorGroup('a-p1', '口语 Part 1')}
        ${authorGroup('a-p2', '口语 Part 2')}
        ${authorGroup('a-p3', '口语 Part 3')}
        ${authorGroup('a-w', '作文')}
      </div>
      <div class="nav-group">${navLink('#/about', '来源与说明')}</div>`;
  }
  function markNav(hashPath) {
    sidebar.querySelectorAll('.nav-link').forEach((a) => {
      if (a.getAttribute('href') === hashPath) {
        a.setAttribute('aria-current', 'page');
        const fold = a.closest('details');
        if (fold) fold.open = true;
      } else a.removeAttribute('aria-current');
    });
  }

  const menuBtn = document.getElementById('menuBtn');
  const scrim = document.getElementById('scrim');
  function openNav() {
    document.body.classList.add('nav-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    scrim.hidden = false;
  }
  function closeNav() {
    document.body.classList.remove('nav-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    scrim.hidden = true;
  }
  menuBtn.addEventListener('click', () => (document.body.classList.contains('nav-open') ? closeNav() : openNav()));
  scrim.addEventListener('click', closeNav);

  // ---------- 目录 ----------

  function renderToc(items) {
    tocEl.innerHTML = items.length
      ? '<p class="toc-title">本页目录</p>' + items.map((x) => `<a href="#" role="button" data-target="${x.id}" class="l${x.level}">${esc(x.text)}</a>`).join('')
      : '';
  }
  tocEl.addEventListener('click', (e) => {
    const a = e.target.closest('[data-target]');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(a.dataset.target);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- 首页 ----------

  function hotP1Item(id) {
    const t = p1ById.get(id);
    if (t) return `<li><a href="#/p1?focus=${id}">${esc(t.en)}</a><span class="muted small">${esc(t.zh)}</span>${isDone('p1:' + id) ? '<span class="check">练过</span>' : ''}</li>`;
    const c = coreById.get(id);
    return `<li><a href="${pageRoute(c.see[0])}">${esc(c.en)}</a><span class="muted small">必考</span></li>`;
  }
  function hotP2Item(id) {
    const c = p2ById.get(id);
    return `<li><a href="#/p2?focus=${id}">${esc(c.zh)}</a>${isDone('p2:' + id) ? '<span class="check">练过</span>' : ''}</li>`;
  }
  const tile = (href, k, v, d) => `<a class="tile" href="${href}"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span><span class="d">${esc(d)}</span></a>`;

  function viewHome() {
    const exam = examInfo();
    const html = `
      <section class="hero">
        <div>
          <div class="eyebrow">${esc(S.season)} · 资料更新到 ${fmtDate(S.updated)}</div>
          <h1>口语新题 + 写作模板</h1>
          <p class="lede">本季新增的 Part 1 话题和 Part 2 题卡、串题建议、Part 3 追问，加上大小作文 13 种题型的模板和 9–10 月考生回忆的真题。</p>
          <div class="row" style="margin-top:16px">
            <a class="btn btn-primary" href="#/p2">看 Part 2 题卡</a>
            <a class="btn" href="#/practice">计时练一张</a>
            <a class="btn" href="#/writing">写作模板</a>
          </div>
        </div>
        ${exam ? `<div class="countdown"><div class="stat-big">${esc(exam.big)}</div><div class="muted">${esc(exam.label)}</div></div>` : ''}
      </section>
      <h2 class="sec">最近考得最多 <span class="count">考情周报 ${esc(S.hot.range)}</span></h2>
      <div class="hot-cols">
        <div class="card"><b>Part 1</b><ol class="hot-list">${S.hot.p1.map(hotP1Item).join('')}</ol></div>
        <div class="card"><b>Part 2 / 3</b><ol class="hot-list">${S.hot.p2.map(hotP2Item).join('')}</ol></div>
      </div>
      <h2 class="sec">内容</h2>
      <div class="grid">
        ${tile('#/p1', 'Part 1 新题', `${S.p1.length} 个话题`, '中英对照，每个话题附答题思路')}
        ${tile('#/p2', 'Part 2 题卡', `${S.p2.length} 张`, '完整题卡和串题建议，能套原作者答案的都标了')}
        ${tile('#/p3', 'Part 3 追问', `${totalP3} 道`, '按 Part 2 题卡分组')}
        ${tile('#/chuanti', '串题', `${S.chuanti.length} 组故事`, '一个故事讲多道题')}
        ${tile('#/practice', '计时练习', '1 分钟 + 2 分钟', 'Part 2 准备、陈述、Part 3 连着练，可以录音')}
        ${tile('#/writing', '写作模板', '13 种题型', '小作文 7 种、大作文 6 种')}
        ${tile('#/recent', '近期真题', `${R.task2.length + R.task1.length} 道`, '2026 年 9 月到 10 月初的考生回忆')}
        ${tile('#/notes', '原作者笔记', `${authorPages.length} 篇`, '做题技巧和口语素材，不含他的做题记录')}
      </div>
      <p class="notice">题目都是考生回忆整理的，不是官方发布，各家对“新题”的标法也不一样。来源和取舍见<a href="#/about">来源与说明</a>。</p>`;
    return { title: '', html };
  }

  // ---------- Part 1 ----------

  const state = { p1: 'all', p2cat: 'all', p2tag: 'all', recentTask: 2, recentType: 'all' };

  function p1Card(t) {
    return `<article class="card" data-id="${t.id}">
      <div class="topic-head"><span class="no">${pad2(p1No.get(t.id))}</span><h3>${esc(t.en)} <span class="zh">${esc(t.zh)}</span></h3>${tagsFor(t, 'p1')}${doneBtn('p1:' + t.id)}</div>
      <table class="qlist"><tbody>${t.qs.map(([en, zh]) => `<tr><td>${esc(en)}</td><td>${esc(zh)}</td></tr>`).join('')}</tbody></table>
      <p class="tip"><b>思路</b>　${esc(t.tip)}</p>
      ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
      ${t.see ? `<div class="links"><span class="lbl">原作者素材</span>${pageLinks(t.see)}</div>` : ''}
      ${t.link ? `<div class="links"><span class="lbl">相关题</span>${itemLinks(t.link)}</div>` : ''}
      <div class="src">来源：${esc(srcLine(t.src, S.sources))}</div>
    </article>`;
  }

  function viewP1() {
    const html = `
      <div class="page-head">
        <div class="eyebrow">口语 · Part 1</div>
        <h1>Part 1 新题</h1>
        <p class="lede">${S.p1.length} 个本季话题。每题答两三句：先直接回答，再补一个原因或例子。</p>
      </div>
      <div class="notice"><span><b>必考</b>　${S.core.map((c) => `<a href="${pageRoute(c.see[0])}">${esc(c.en)}</a>`).join('　·　')}　每场都可能考，素材在原作者笔记里。</span></div>
      <div class="filters" role="group" aria-label="筛选">${segs('f', FILTERS, state.p1)}</div>
      <p class="small muted">练过 <span data-count="p1"></span></p>
      <div id="list"></div>
      <h2 class="sec">海外考区专属</h2>
      <p class="muted">${S.p1Overseas.map((t) => `${esc(t.en)}（${esc(t.zh)}）`).join('　·　')}。大陆考生可以不准备。</p>`;
    const draw = () => {
      const list = S.p1.filter((t) => matchFilter(t, state.p1, 'p1'));
      document.getElementById('list').innerHTML = list.length ? list.map(p1Card).join('') : '<p class="notice">这个筛选下没有话题。</p>';
    };
    return {
      title: 'Part 1 新题',
      html,
      after() {
        bindSegs(main, 'f', (v) => {
          state.p1 = v;
          draw();
        });
        draw();
        updateCounts();
      }
    };
  }

  // ---------- Part 2 ----------

  function p2Card(c) {
    return `<article class="card" data-id="${c.id}">
      <div class="topic-head"><span class="no">#${p2No.get(c.id)}</span><h3>${esc(c.zh)}</h3>${tagsFor(c, 'p2')}${doneBtn('p2:' + c.id)}</div>
      ${c.alias ? `<div class="alias">也叫：${esc(c.alias)}</div>` : ''}
      <p class="cue-en">${esc(c.en)}</p>
      <div class="say-label">You should say:</div>
      <ul class="say">${c.say.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <p class="tip"><b>思路 / 串题</b>　${esc(c.tip)}</p>
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      ${c.see ? `<div class="links"><span class="lbl">原作者答案</span>${pageLinks(c.see)}</div>` : ''}
      ${c.link ? `<div class="links"><span class="lbl">相关题</span>${itemLinks(c.link)}</div>` : ''}
      <details class="p3"><summary>Part 3 追问（${c.p3.length}）</summary><ol>${c.p3.map((q) => `<li>${esc(q)}</li>`).join('')}</ol></details>
      <div class="card-actions"><a class="btn btn-sm" href="#/practice?card=${c.id}">计时练这张</a></div>
      <div class="src">来源：${esc(srcLine(c.src, S.sources))}</div>
    </article>`;
  }

  function viewP2() {
    const cats = [['all', '全部'], ...Object.entries(S.categories)];
    const html = `
      <div class="page-head">
        <div class="eyebrow">口语 · Part 2</div>
        <h1>Part 2 题卡</h1>
        <p class="lede">${S.p2.length} 张本季新卡。1 分钟准备、讲 2 分钟，讲完考官会接着问 Part 3，每张卡下面可以展开看追问。</p>
      </div>
      <div class="filters" role="group" aria-label="按类别"><span class="label">类别</span>${segs('cat', cats, state.p2cat)}</div>
      <div class="filters" role="group" aria-label="按标记"><span class="label">标记</span>${segs('tag', FILTERS, state.p2tag)}</div>
      <p class="small muted">练过 <span data-count="p2"></span>　·　一个故事能讲好几张卡，见 <a href="#/chuanti">串题</a></p>
      <div id="list"></div>
      <h2 class="sec">海外考区专属</h2>
      <ul>${S.p2Overseas.map((c) => `<li>${esc(c.zh)} <span class="muted small">${esc(c.en)}</span></li>`).join('')}</ul>`;
    const draw = () => {
      const list = S.p2.filter((c) => (state.p2cat === 'all' || c.cat === state.p2cat) && matchFilter(c, state.p2tag, 'p2'));
      let out = '';
      if (!list.length) out = '<p class="notice">这个筛选下没有题卡。</p>';
      else if (state.p2cat === 'all')
        Object.entries(S.categories).forEach(([cat, label]) => {
          const part = list.filter((c) => c.cat === cat);
          if (part.length) out += `<h2 class="sec">${label}<span class="count">${part.length} 张</span></h2>` + part.map(p2Card).join('');
        });
      else out = list.map(p2Card).join('');
      document.getElementById('list').innerHTML = out;
    };
    return {
      title: 'Part 2 题卡',
      html,
      after() {
        bindSegs(main, 'cat', (v) => {
          state.p2cat = v;
          draw();
        });
        bindSegs(main, 'tag', (v) => {
          state.p2tag = v;
          draw();
        });
        draw();
        updateCounts();
      }
    };
  }

  // ---------- Part 3 ----------

  function viewP3() {
    const html = `
      <div class="page-head">
        <div class="eyebrow">口语 · Part 3</div>
        <h1>Part 3 追问</h1>
        <p class="lede">按 Part 2 题卡分组，共 ${totalP3} 道。Part 3 每题说三四句：观点 → 原因 → 例子或对比。</p>
      </div>
      <div class="notice"><span>回答框架和万能语料见原作者的 <a href="#/page/a-p3-base">P3 万能框架与语料</a>；科技、AI 类问题见 <a href="#/page/a-p3-tech">P3 科技问题</a>。</span></div>
      <div class="row" style="margin:8px 0 4px"><button class="btn btn-sm" type="button" id="openAll">全部展开</button><button class="btn btn-sm" type="button" id="closeAll">全部收起</button></div>
      ${S.p2
        .map(
          (c) => `<details class="p3-group" data-id="${c.id}"><summary><span class="no">#${p2No.get(c.id)}</span><b>${esc(c.zh)}</b><span class="en">${esc(c.en)}</span></summary>
          <ol>${c.p3.map((q) => `<li>${esc(q)}</li>`).join('')}</ol></details>`
        )
        .join('')}`;
    return {
      title: 'Part 3 追问',
      html,
      after() {
        document.getElementById('openAll').onclick = () => main.querySelectorAll('details.p3-group').forEach((d) => (d.open = true));
        document.getElementById('closeAll').onclick = () => main.querySelectorAll('details.p3-group').forEach((d) => (d.open = false));
      }
    };
  }

  // ---------- 串题 ----------

  const chipFor = (id) => {
    const c = p2ById.get(id);
    return `<a class="chip-link${isDone('p2:' + id) ? ' done' : ''}" href="#/p2?focus=${id}"><span class="no">#${p2No.get(id)}</span>${esc(c.zh)}</a>`;
  };
  function coveredBy(pageId) {
    return S.p2.filter((c) => (c.see || []).includes(pageId)).map((c) => c.id);
  }

  function viewChuanti() {
    const stories = authorPages.filter((p) => p.group === 'a-p2' || p.group === 'a-p1' || p.group === 'a-p3').map((p) => ({ p, cards: coveredBy(p.id) })).filter((x) => x.cards.length);
    const html = `
      <div class="page-head">
        <div class="eyebrow">口语 · 串题</div>
        <h1>一个故事讲多道题</h1>
        <p class="lede">先准备好下面 ${S.chuanti.length} 组故事，Part 2 大部分卡都能覆盖。换题时只改开头一句和最贴题的那个细节，Part 3 的观点要另外准备。</p>
      </div>
      ${S.chuanti
        .map(
          (g) => `<section class="card"><b style="font-size:17px">${esc(g.title)}</b>
          <p class="tip" style="margin-top:8px"><b>故事建议</b>　${esc(g.story)}</p>
          <div class="chips">${g.cards.map(chipFor).join('')}</div></section>`
        )
        .join('')}
      <h2 class="sec">原作者的答案能套哪些新卡</h2>
      <p class="muted small">原作者笔记里的经历（攀岩、跑步、实习、读研）是他本人的，借用时换成你自己的细节更自然。</p>
      ${stories
        .map(
          ({ p, cards }) => `<section class="card"><a href="${pageRoute(p.id)}"><b>${esc(p.title)}</b></a>
          <div class="chips">${cards.map(chipFor).join('')}</div></section>`
        )
        .join('')}`;
    return { title: '串题', html };
  }

  // ---------- 计时练习 ----------

  let practice = null;
  function stopPractice() {
    if (practice) practice.destroy();
    practice = null;
  }

  let audioCtx = null;
  function ensureAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {
      audioCtx = null;
    }
  }
  function beep(times) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + 0.02;
    for (let k = 0; k < times; k++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const t = t0 + k * 0.28;
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.22);
    }
  }

  function createRecorder() {
    let stream = null;
    let rec = null;
    let chunks = [];
    let url = null;
    let released = false;
    return {
      async prepare() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) throw new Error('这个浏览器不支持录音');
        if (stream) return;
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (released) {
          s.getTracks().forEach((t) => t.stop());
          throw new Error('released');
        }
        stream = s;
      },
      start() {
        if (!stream || (rec && rec.state !== 'inactive')) return;
        chunks = [];
        const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
        rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
        rec.start();
      },
      pause() {
        if (rec && rec.state === 'recording' && rec.pause) rec.pause();
      },
      resume() {
        if (rec && rec.state === 'paused' && rec.resume) rec.resume();
      },
      stop() {
        return new Promise((resolve) => {
          if (!rec || rec.state === 'inactive') return resolve(null);
          rec.onstop = () => {
            const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
            if (url) URL.revokeObjectURL(url);
            url = URL.createObjectURL(blob);
            resolve({ url, type: blob.type });
          };
          rec.stop();
        });
      },
      discard() {
        if (rec && rec.state !== 'inactive') {
          rec.onstop = null;
          rec.stop();
        }
        rec = null;
        chunks = [];
      },
      release() {
        released = true;
        this.discard();
        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null;
        if (url) URL.revokeObjectURL(url);
        url = null;
      },
      get active() {
        return Boolean(rec && rec.state !== 'inactive');
      },
      get ready() {
        return Boolean(stream);
      }
    };
  }

  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
  };

  // phases: [{ label, secs, record, q, beepEnd }]
  function mountTimer(box, phases, opts) {
    const recorder = createRecorder();
    let i = 0;
    let left = phases[0].secs * 1000;
    let endAt = 0;
    let running = false;
    let finished = false;
    let interval = 0;
    const el = (id) => box.querySelector(`[data-t="${id}"]`);
    box.innerHTML = `
      <div class="phase" data-t="phase"></div>
      <div class="clock" data-t="clock" aria-live="off"></div>
      <div class="bar"><i data-t="bar"></i></div>
      <div class="row">
        <button class="btn btn-primary" type="button" data-t="start">开始</button>
        <button class="btn" type="button" data-t="next">下一步</button>
        <button class="btn" type="button" data-t="reset">重来</button>
      </div>
      <div class="p3-now" data-t="q" hidden></div>
      <div class="opts">
        ${opts.recordable ? '<label><input type="checkbox" data-t="rec"> 录音</label>' : ''}
        <label><input type="checkbox" data-t="beep" checked> 提示音</label>
      </div>
      <div class="rec" data-t="recbox" hidden></div>
      ${opts.footer || ''}`;

    const recBox = el('recbox');
    const showRec = (html) => {
      recBox.hidden = !html;
      recBox.innerHTML = html || '';
    };
    const wantRec = () => opts.recordable && el('rec') && el('rec').checked;
    const wantBeep = () => el('beep').checked;

    function draw() {
      const ph = phases[i];
      const total = ph.secs * 1000;
      el('phase').textContent = finished ? '结束' : ph.label;
      el('clock').textContent = finished ? '0:00' : fmtClock(left);
      el('clock').className = 'clock' + (!finished && left <= 10000 && running ? ' warn' : '');
      el('bar').style.width = `${finished ? 100 : Math.min(100, (1 - left / total) * 100)}%`;
      el('start').textContent = running ? '暂停' : finished ? '再来一次' : left < total ? '继续' : '开始';
      el('next').disabled = finished;
      const q = el('q');
      q.hidden = finished || !ph.q;
      if (ph.q) q.innerHTML = ph.q;
    }
    function enter() {
      const ph = phases[i];
      if (ph.record && wantRec() && recorder.ready && !recorder.active) {
        recorder.start();
        showRec('<span class="rec-dot"></span>录音中，结束后可以回放');
      }
      if (opts.onEnter) opts.onEnter(ph, i);
    }
    async function finish(auto) {
      finished = true;
      running = false;
      clearInterval(interval);
      if (auto && wantBeep()) beep(3);
      draw();
      if (recorder.active) {
        const r = await recorder.stop();
        if (r) {
          const ext = /mp4/.test(r.type) ? 'm4a' : /ogg/.test(r.type) ? 'ogg' : 'webm';
          showRec(`<b>录音回放</b><audio controls src="${r.url}"></audio><div class="row small" style="margin-top:6px"><a class="btn btn-sm" href="${r.url}" download="${esc(opts.fileBase || 'speaking')}-${localDate()}.${ext}">下载录音</a><span class="muted">录音只在这台设备上，刷新页面就没了。</span></div>`);
        }
      }
      if (opts.onFinish) opts.onFinish();
    }
    function advance(auto) {
      if (i >= phases.length - 1) return finish(auto);
      if (auto && wantBeep()) beep(phases[i].beepEnd || 1);
      i += 1;
      left = phases[i].secs * 1000;
      if (running) {
        endAt = performance.now() + left;
        enter();
      }
      draw();
    }
    function tick() {
      left = endAt - performance.now();
      if (left <= 0) advance(true);
      else draw();
    }
    let micPending = false;
    function requestMic() {
      if (!wantRec() || recorder.ready || micPending) return;
      micPending = true;
      showRec('<span class="muted">正在请求麦克风权限，请在浏览器弹窗里点“允许”。计时不受影响。</span>');
      recorder
        .prepare()
        .then(() => {
          micPending = false;
          if (running && !finished && phases[i].record) {
            recorder.start();
            showRec('<span class="rec-dot"></span>录音中，结束后可以回放');
          } else showRec('<span class="muted">麦克风已就绪，开始回答时自动录音。</span>');
        })
        .catch((err) => {
          micPending = false;
          if (err && err.message === 'released') return;
          if (el('rec')) el('rec').checked = false;
          showRec(`<span class="muted">没法录音：${esc(err && err.name === 'NotAllowedError' ? '没有麦克风权限' : (err && err.message) || '浏览器不支持')}。计时照常进行。</span>`);
        });
    }
    if (el('rec')) el('rec').addEventListener('change', () => el('rec').checked && requestMic());
    function start() {
      ensureAudio();
      if (finished) return reset();
      requestMic();
      running = true;
      endAt = performance.now() + left;
      clearInterval(interval);
      interval = setInterval(tick, 200);
      if (left === phases[i].secs * 1000) enter();
      else recorder.resume();
      draw();
    }
    function pause() {
      running = false;
      left = Math.max(0, endAt - performance.now());
      clearInterval(interval);
      recorder.pause();
      draw();
    }
    function reset() {
      clearInterval(interval);
      recorder.discard();
      showRec('');
      i = 0;
      left = phases[0].secs * 1000;
      running = false;
      finished = false;
      if (opts.onReset) opts.onReset();
      draw();
    }
    el('start').addEventListener('click', () => (running ? pause() : start()));
    el('next').addEventListener('click', () => advance(false));
    el('reset').addEventListener('click', reset);
    const onKey = (e) => {
      if (isTyping(e.target) || e.target.closest('button, a, summary')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        running ? pause() : start();
      }
    };
    document.addEventListener('keydown', onKey);
    draw();
    return {
      destroy() {
        clearInterval(interval);
        recorder.release();
        document.removeEventListener('keydown', onKey);
      }
    };
  }

  const cueHtml = (c) => `
    <div class="topic-head"><span class="no">#${p2No.get(c.id)}</span><h3>${esc(c.zh)}</h3>${tagsFor(c, 'p2')}</div>
    <p class="cue-en">${esc(c.en)}</p>
    <div class="say-label">You should say:</div>
    <ul class="say">${c.say.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    <details class="p3"><summary>思路 / 串题</summary><p class="tip">${esc(c.tip)}</p>${c.see ? `<div class="links"><span class="lbl">原作者答案</span>${pageLinks(c.see)}</div>` : ''}</details>`;

  function viewPractice(_, query) {
    const mode = query.get('mode') || (query.get('topic') ? 'p1' : 'p2');
    const html = `
      <div class="page-head">
        <div class="eyebrow">口语 · 练习</div>
        <h1>计时练习</h1>
        <p class="lede">和考场节奏一样：Part 2 准备 1 分钟、讲 2 分钟，接着回答几道 Part 3。时间到会响提示音，可以录音回放。空格键开始或暂停。</p>
      </div>
      <div class="filters" role="group" aria-label="练习模式">${segs('mode', [['p2', 'Part 2 + Part 3'], ['p1', 'Part 1'], ['free', '只计时']], mode)}</div>
      <div id="practiceBody"></div>`;
    return {
      title: '计时练习',
      html,
      after() {
        const body = document.getElementById('practiceBody');
        const show = (m) => {
          stopPractice();
          if (m === 'p1') practice = practiceP1(body, query.get('topic'));
          else if (m === 'free') practice = practiceFree(body);
          else practice = practiceP2(body, query.get('card'));
        };
        bindSegs(main, 'mode', show);
        show(mode);
      }
    };
  }

  function practiceP2(body, cardId) {
    let card = p2ById.get(cardId) || pick(S.p2.filter((c) => !isDone('p2:' + c.id)).length ? S.p2.filter((c) => !isDone('p2:' + c.id)) : S.p2);
    let p3n = 3;
    let p3s = 40;
    let timer = null;
    const options = Object.entries(S.categories)
      .map(([cat, label]) => `<optgroup label="${label}">${S.p2.filter((c) => c.cat === cat).map((c) => `<option value="${c.id}">#${p2No.get(c.id)} ${esc(c.zh)}</option>`).join('')}</optgroup>`)
      .join('');
    body.innerHTML = `
      <div class="practice-grid">
        <div>
          <div class="picker">
            <select id="cardSel" aria-label="选择题卡">${options}</select>
            <button class="btn" type="button" id="randBtn">随机一张</button>
            <select id="randScope" class="narrow" aria-label="随机范围"><option value="todo">从未练过的里抽</option><option value="all">从全部里抽</option><option value="mainland">从大陆新题里抽</option><option value="hot">从近期高频里抽</option></select>
          </div>
          <article class="card" id="cueCard"></article>
          <div class="opts" style="justify-content:flex-start">
            <label>Part 3 <select id="p3n"><option value="0">不练</option><option value="2">2 题</option><option value="3" selected>3 题</option><option value="4">4 题</option></select></label>
            <label>每题 <select id="p3s"><option value="30">30 秒</option><option value="40" selected>40 秒</option><option value="60">60 秒</option></select></label>
          </div>
        </div>
        <div class="card timer-card" id="timerBox"></div>
      </div>`;
    const sel = body.querySelector('#cardSel');
    function build() {
      if (timer) timer.destroy();
      sel.value = card.id;
      body.querySelector('#cueCard').innerHTML = cueHtml(card);
      const qs = shuffle(card.p3).slice(0, p3n);
      const phases = [
        { label: 'Part 2 · 准备 1 分钟', secs: 60 },
        { label: 'Part 2 · 陈述 2 分钟', secs: 120, record: true, beepEnd: 2 },
        ...qs.map((q, k) => ({ label: `Part 3 · 第 ${k + 1} / ${qs.length} 题`, secs: p3s, record: true, q: esc(q) }))
      ];
      timer = mountTimer(body.querySelector('#timerBox'), phases, {
        recordable: true,
        fileBase: `P2-${p2No.get(card.id)}`,
        footer: `<div class="row" style="margin-top:14px">${doneBtn('p2:' + card.id)}</div>`,
        onFinish() {
          if (!isDone('p2:' + card.id)) toast('练完了，可以点“标记练过”');
        }
      });
    }
    sel.addEventListener('change', () => {
      card = p2ById.get(sel.value);
      build();
    });
    body.querySelector('#randBtn').addEventListener('click', () => {
      const scope = body.querySelector('#randScope').value;
      let pool = S.p2.filter((c) => matchFilter(c, scope, 'p2') && c.id !== card.id);
      if (!pool.length) {
        toast(scope === 'todo' ? '都练过了，从全部里抽' : '这个范围只有这一张');
        pool = S.p2.filter((c) => c.id !== card.id);
      }
      card = pick(pool);
      build();
    });
    body.querySelector('#p3n').addEventListener('change', (e) => {
      p3n = Number(e.target.value);
      build();
    });
    body.querySelector('#p3s').addEventListener('change', (e) => {
      p3s = Number(e.target.value);
      build();
    });
    build();
    return {
      destroy() {
        if (timer) timer.destroy();
      }
    };
  }

  function practiceP1(body, topicId) {
    let topic = p1ById.get(topicId) || pick(S.p1);
    let secs = 25;
    let count = 4;
    let timer = null;
    body.innerHTML = `
      <div class="practice-grid">
        <div>
          <div class="picker">
            <select id="topicSel" aria-label="选择话题">
              <optgroup label="必考">${S.core.map((c) => `<option value="core:${c.id}">${esc(c.en)}</option>`).join('')}</optgroup>
              <optgroup label="本季新题">${S.p1.map((t) => `<option value="${t.id}">${esc(t.en)}（${esc(t.zh)}）</option>`).join('')}</optgroup>
            </select>
            <button class="btn" type="button" id="randBtn">随机一个</button>
          </div>
          <article class="card" id="topicCard"></article>
          <div class="opts" style="justify-content:flex-start">
            <label>题数 <select id="qn"><option value="3">3 题</option><option value="4" selected>4 题</option><option value="5">5 题</option></select></label>
            <label>每题 <select id="qs"><option value="20">20 秒</option><option value="25" selected>25 秒</option><option value="30">30 秒</option></select></label>
          </div>
        </div>
        <div class="card timer-card" id="timerBox"></div>
      </div>`;
    const sel = body.querySelector('#topicSel');
    function build() {
      if (timer) timer.destroy();
      const isCore = !topic.qs;
      sel.value = isCore ? `core:${topic.id}` : topic.id;
      const qs = isCore ? [] : shuffle(topic.qs).slice(0, count);
      body.querySelector('#topicCard').innerHTML = isCore
        ? `<h3 style="margin:0">${esc(topic.en)}（${esc(topic.zh)}）</h3><p class="tip">必考话题的题目和答案在原作者笔记里：${pageLinks(topic.see)}。打开对照着练，计时器按每题 ${secs} 秒走。</p>`
        : `<div class="topic-head"><h3>${esc(topic.en)} <span class="zh">${esc(topic.zh)}</span></h3>${tagsFor(topic, 'p1')}</div><p class="tip"><b>思路</b>　${esc(topic.tip)}</p><p class="muted small">题目会在右边逐题出现，答完可以点“下一步”。</p>`;
      const phases = isCore
        ? Array.from({ length: count }, (_, k) => ({ label: `第 ${k + 1} / ${count} 题`, secs }))
        : qs.map(([en, zh], k) => ({ label: `第 ${k + 1} / ${qs.length} 题`, secs, record: true, q: `<div class="p1-q">${esc(en)}</div><div class="muted small">${esc(zh)}</div>` }));
      timer = mountTimer(body.querySelector('#timerBox'), phases, {
        recordable: !isCore,
        fileBase: `P1-${topic.id}`,
        footer: isCore ? '' : `<div class="row" style="margin-top:14px">${doneBtn('p1:' + topic.id)}</div>`
      });
    }
    sel.addEventListener('change', () => {
      topic = sel.value.startsWith('core:') ? coreById.get(sel.value.slice(5)) : p1ById.get(sel.value);
      build();
    });
    body.querySelector('#randBtn').addEventListener('click', () => {
      topic = pick(S.p1.filter((t) => t !== topic));
      build();
    });
    body.querySelector('#qn').addEventListener('change', (e) => {
      count = Number(e.target.value);
      build();
    });
    body.querySelector('#qs').addEventListener('change', (e) => {
      secs = Number(e.target.value);
      build();
    });
    build();
    return {
      destroy() {
        if (timer) timer.destroy();
      }
    };
  }

  function practiceFree(body) {
    const presets = [
      ['Part 1 · 20 秒', [{ label: 'Part 1 回答', secs: 20 }]],
      ['Part 3 · 40 秒', [{ label: 'Part 3 回答', secs: 40 }]],
      ['Part 2 准备 · 1 分钟', [{ label: 'Part 2 准备', secs: 60 }]],
      ['Part 2 陈述 · 2 分钟', [{ label: 'Part 2 陈述', secs: 120, record: true }]],
      ['Part 2 全程 · 1 + 2 分钟', [{ label: 'Part 2 准备', secs: 60 }, { label: 'Part 2 陈述', secs: 120, record: true, beepEnd: 2 }]],
      ['完整口语 · 14 分钟', [{ label: 'Part 1（4–5 分钟）', secs: 300, record: true }, { label: 'Part 2 准备', secs: 60 }, { label: 'Part 2 陈述', secs: 120, record: true, beepEnd: 2 }, { label: 'Part 3（4–5 分钟）', secs: 300, record: true }]]
    ];
    let timer = null;
    body.innerHTML = `
      <div class="practice-grid">
        <div><div class="preset-grid">${presets.map(([label], k) => `<button class="seg" type="button" data-preset="${k}" aria-pressed="${k === 4}">${esc(label)}</button>`).join('')}</div>
        <p class="muted small" style="margin-top:12px">对着原作者笔记或题卡练的时候，用这里单独计时。</p></div>
        <div class="card timer-card" id="timerBox"></div>
      </div>`;
    const use = (k) => {
      if (timer) timer.destroy();
      timer = mountTimer(body.querySelector('#timerBox'), presets[k][1], { recordable: true, fileBase: 'speaking' });
    };
    bindSegs(body, 'preset', (k) => use(Number(k)));
    use(4);
    return {
      destroy() {
        if (timer) timer.destroy();
      }
    };
  }

  // ---------- 写作 ----------

  function recentItem(q, task, onTypePage) {
    const names = task === 2 ? R.task2Types : R.task1Types;
    const t = onTypePage ? null : typeByRecent.get(q.type);
    const flags = (q.flags || []).map((f) => (f === 'repeat' ? '<span class="tag tag-repeat">近期重复</span>' : '<span class="tag">往年旧题</span>')).join('');
    return `<div class="recent-item">
      <div class="meta"><span>${esc(q.week)}</span>${t ? `<a class="tag tag-author" href="#/w/${t.id}">${esc(names[q.type])}</a>` : `<span class="tag">${esc(names[q.type])}</span>`}${q.parts ? `<span class="tag">${esc(q.parts)}</span>` : ''}${flags}<span class="muted">${esc((R.sources[q.src] && R.sources[q.src].short) || '')}</span></div>
      <p class="q">${esc(q.q)}</p>
      ${q.zh ? `<p class="zh">${esc(q.zh)}</p>` : ''}
      ${q.note ? `<p class="note">${esc(q.note)}</p>` : ''}
    </div>`;
  }
  const recentOf = (t) => (t.task === 1 ? R.task1 : R.task2).filter((q) => q.type === t.recent);

  function typeTile(t) {
    const first = pages.get(t.pages[0]);
    return `<a class="type-tile" href="#/w/${t.id}"><b>${esc(t.name)}</b><span class="en">${esc(t.en)}</span><span class="how">${esc(t.how)}</span>
      <span class="meta">${first.origin === 'author' ? '原作者模板' : '本站补充'}${t.pages.length > 1 ? ' + 原作者词汇' : ''}　·　近期真题 ${recentOf(t).length} 道</span></a>`;
  }

  function viewWriting() {
    const html = `
      <div class="page-head">
        <div class="eyebrow">写作</div>
        <h1>写作模板</h1>
        <p class="lede">先看题目判断题型，再套对应模板。每种题型的页面后面都附了 2026 年 9–10 月考生回忆的真题，可以直接拿来练。</p>
      </div>
      <div class="section-head"><h2>小作文 Task 1</h2><a class="btn btn-sm" href="#/page/s-t1-overview">总览：四段结构、时态、常见丢分</a></div>
      <div class="type-grid">${TYPES.filter((t) => t.task === 1).map(typeTile).join('')}</div>
      <div class="section-head"><h2>大作文 Task 2</h2><a class="btn btn-sm" href="#/page/s-t2-overview">总览：怎么认题型、混合题怎么拆</a></div>
      <div class="type-grid">${TYPES.filter((t) => t.task === 2).map(typeTile).join('')}</div>
      <div class="section-head"><h2>积累和批改</h2></div>
      <div class="grid">
        ${tile('#/page/a-w-t1-vocab', '原作者笔记', '小作文通识积累', '花销、比例、趋势、约数等表达')}
        ${tile('#/page/a-w-t2-vocab', '原作者笔记', '大作文通识积累', '高频话题词和替换表达')}
        ${tile('#/page/a-w-ai', '原作者笔记', 'AI 批改提示词', '写完丢给 AI 逐句改到 6.5')}
        ${tile('#/recent', '考生回忆', '近期真题', `${R.task2.length} 道大作文、${R.task1.length} 道小作文`)}
      </div>`;
    return { title: '写作模板', html };
  }

  function viewWritingType([id]) {
    const t = typeById.get(id);
    if (!t) return viewNotFound();
    const list = recentOf(t);
    const toc = [];
    const sections = t.pages
      .map((pid) => {
        const p = pages.get(pid);
        const html = p.html.replace(/id="h(\d+)"/g, `id="${pid}-h$1"`);
        toc.push({ level: 2, id: `${pid}-top`, text: (p.origin === 'author' ? '原作者：' : '') + p.title });
        p.toc.filter((x) => x.level === 2).forEach((x) => toc.push({ level: 3, id: `${pid}-${x.id}`, text: x.text }));
        return `<section><div class="origin" id="${pid}-top">${originTag(p)}<h2>${esc(p.title)}</h2></div><div class="prose">${html}</div></section>`;
      })
      .join('');
    toc.push({ level: 2, id: 'recent', text: `近期真题（${list.length}）` });
    const idx = TYPES.indexOf(t);
    const prev = TYPES[idx - 1];
    const next = TYPES[idx + 1];
    const html = `
      <div class="page-head">
        <div class="eyebrow">${t.task === 1 ? '小作文 · Task 1' : '大作文 · Task 2'}</div>
        <h1>${esc(t.name)} <span class="muted" style="font-weight:400">${esc(t.en)}</span></h1>
        <p class="lede">${esc(t.how)}</p>
      </div>
      ${sections}
      <div class="origin" id="recent"><span class="tag">考生回忆</span><h2>近期真题（${list.length}）</h2></div>
      ${list.length ? list.map((q) => recentItem(q, t.task, true)).join('') : '<p class="muted">9–10 月的回忆里还没有这种题型。</p>'}
      <nav class="pager" aria-label="上一个和下一个题型">
        ${prev ? `<a href="#/w/${prev.id}"><small>上一个</small>${esc(prev.name)}</a>` : '<span></span>'}
        ${next ? `<a class="next" href="#/w/${next.id}"><small>下一个</small>${esc(next.name)}</a>` : ''}
      </nav>`;
    return { title: t.name, html, toc };
  }

  function viewRecent() {
    const html = `
      <div class="page-head">
        <div class="eyebrow">写作 · 考生回忆</div>
        <h1>近期真题</h1>
        <p class="lede">${esc(R.range)} 考生考后回忆的题目，按题型分好了，点题型标签可以跳到对应模板。“近期重复”表示最近三个月有两次以上报告。</p>
      </div>
      <div class="filters" role="group" aria-label="大作文或小作文">${segs('task', [['2', `大作文（${R.task2.length}）`], ['1', `小作文（${R.task1.length}）`]], String(state.recentTask))}</div>
      <div class="filters" role="group" aria-label="题型" id="typeFilters"></div>
      <div id="list"></div>`;
    const draw = () => {
      const task = state.recentTask;
      const names = task === 2 ? R.task2Types : R.task1Types;
      const all = task === 2 ? R.task2 : R.task1;
      const opts = [['all', '全部'], ...Object.entries(names).filter(([k]) => all.some((q) => q.type === k)).map(([k, v]) => [k, `${v}（${all.filter((q) => q.type === k).length}）`])];
      if (!opts.some(([k]) => k === state.recentType)) state.recentType = 'all';
      const tf = document.getElementById('typeFilters');
      tf.innerHTML = segs('type', opts, state.recentType);
      bindSegs(tf, 'type', (v) => {
        state.recentType = v;
        draw();
      });
      const list = all.filter((q) => state.recentType === 'all' || q.type === state.recentType);
      document.getElementById('list').innerHTML = list.map((q) => recentItem(q, task)).join('');
    };
    return {
      title: '近期真题',
      html,
      after() {
        bindSegs(main, 'task', (v) => {
          state.recentTask = Number(v);
          state.recentType = 'all';
          draw();
        });
        draw();
      }
    };
  }

  // ---------- 原作者笔记 ----------

  function viewNotes() {
    const groups = [
      ['a-p1', '口语 Part 1'],
      ['a-p2', '口语 Part 2'],
      ['a-p3', '口语 Part 3'],
      ['a-w', '作文做题技巧']
    ];
    const html = `
      <div class="page-head">
        <div class="eyebrow">原作者笔记</div>
        <h1>原作者笔记</h1>
        <p class="lede">来自公开仓库 <a href="${DATA.authorRepo}" target="_blank" rel="noopener">flamingoTOM/lxy_ILETS</a>（作者 @小玉你待在家里），收录他的做题技巧和口语素材，正文没有改动。</p>
      </div>
      <div class="notice"><span><b>没有收录</b>　他听力、阅读真题的错题和错因，自己写的大小作文和批改，自批改表格，讲义 PDF，以及每篇顶部的复习打卡表。</span></div>
      ${groups
        .map(([g, label]) => {
          const list = authorPages.filter((p) => p.group === g);
          return `<h2 class="sec">${label}<span class="count">${list.length} 篇</span></h2>
          <div class="grid">${list
            .map((p) => {
              const cover = coveredBy(p.id);
              return `<a class="tile" href="${pageRoute(p.id)}"><span class="v" style="font-size:16px">${esc(p.title)}</span><span class="d">${cover.length ? `能套 ${cover.length} 张新卡` : esc(p.text.slice(0, 40)) + '…'}</span></a>`;
            })
            .join('')}</div>`;
        })
        .join('')}`;
    return { title: '原作者笔记', html };
  }

  function viewPage([id]) {
    const p = pages.get(id);
    if (!p) return viewNotFound();
    const t = TYPES.find((x) => x.pages[0] === id);
    if (t) {
      location.replace(`#/w/${t.id}`);
      return { html: '' };
    }
    const group = DATA.pages.filter((x) => x.group === p.group);
    const k = group.indexOf(p);
    const prev = group[k - 1];
    const next = group[k + 1];
    const cover = coveredBy(p.id);
    const used = S.p1.filter((x) => (x.see || []).includes(p.id));
    const groupLabel = { 'a-p1': '口语 Part 1', 'a-p2': '口语 Part 2', 'a-p3': '口语 Part 3', 'a-w': '作文', supplement: '写作' }[p.group];
    const html = `
      <div class="page-head">
        <div class="eyebrow">${p.origin === 'author' ? '原作者笔记' : '本站补充'} · ${groupLabel}</div>
        <h1>${esc(p.title)}</h1>
        ${p.origin === 'author' && p.group !== 'a-w' ? '<p class="lede">答案里的经历是作者本人的，借用时换成自己的细节。</p>' : ''}
      </div>
      ${cover.length || used.length ? `<div class="card"><b>这篇能套的本季新题</b><div class="chips">${cover.map(chipFor).join('')}${used.map((x) => `<a class="chip-link" href="#/p1?focus=${x.id}">P1 ${esc(x.en)}</a>`).join('')}</div></div>` : ''}
      <article class="prose">${p.html}</article>
      <nav class="pager" aria-label="同组上一篇和下一篇">
        ${prev ? `<a href="${pageRoute(prev.id)}"><small>上一篇</small>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="next" href="${pageRoute(next.id)}"><small>下一篇</small>${esc(next.title)}</a>` : ''}
      </nav>`;
    return { title: p.title, html, toc: p.toc };
  }

  // ---------- 搜索 ----------

  let index = null;
  function buildIndex() {
    const items = [];
    S.p1.forEach((t) => items.push({ g: 'Part 1 话题', title: `${t.en}（${t.zh}）`, href: `#/p1?focus=${t.id}`, text: [t.en, t.zh, ...t.qs.flat(), t.tip, t.note].filter(Boolean).join(' ') }));
    S.p2.forEach((c) => items.push({ g: 'Part 2 题卡', title: `#${p2No.get(c.id)} ${c.zh}`, href: `#/p2?focus=${c.id}`, text: [c.zh, c.alias, c.en, ...c.say, c.tip, c.note].filter(Boolean).join(' ') }));
    S.p2.forEach((c) => c.p3.forEach((q) => items.push({ g: 'Part 3 追问', title: q, sub: `#${p2No.get(c.id)} ${c.zh}`, href: `#/p3?focus=${c.id}`, text: q })));
    R.task2.forEach((q) => items.push({ g: '写作真题', title: `大作文 · ${R.task2Types[q.type]} · ${q.week}`, href: `#/w/${typeByRecent.get(q.type).id}`, text: `${q.q} ${q.zh || ''}` }));
    R.task1.forEach((q) => {
      const t = typeByRecent.get(q.type);
      items.push({ g: '写作真题', title: `小作文 · ${R.task1Types[q.type]} · ${q.week}`, href: t ? `#/w/${t.id}` : '#/recent', text: q.q });
    });
    DATA.pages.forEach((p) => items.push({ g: p.origin === 'author' ? '原作者笔记' : '写作模板', title: p.title, href: pageRoute(p.id), text: p.text }));
    items.forEach((x) => (x.low = (x.title + ' ' + x.text).toLowerCase()));
    return items;
  }
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function highlight(text, terms) {
    const re = new RegExp(`(${terms.map(reEsc).join('|')})`, 'gi');
    return text
      .split(re)
      .map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)))
      .join('');
  }
  function snippet(text, terms) {
    const low = text.toLowerCase();
    let pos = -1;
    terms.forEach((t) => {
      const p = low.indexOf(t);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    });
    if (pos < 0) return '';
    const start = Math.max(0, pos - 30);
    return (start > 0 ? '…' : '') + text.slice(start, pos + 90) + (pos + 90 < text.length ? '…' : '');
  }

  function viewSearch(_, query) {
    const q = (query.get('q') || '').trim();
    if (searchInput.value.trim() !== q && document.activeElement !== searchInput) searchInput.value = q;
    if (!q) return { title: '搜索', html: '<div class="page-head"><h1>搜索</h1><p class="lede">在顶部输入关键词，中英文都可以，比如 history、早起、outweigh。</p></div>' };
    index = index || buildIndex();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = index.filter((x) => terms.every((t) => x.low.includes(t)));
    const groups = new Map();
    hits.forEach((h) => {
      if (!groups.has(h.g)) groups.set(h.g, []);
      groups.get(h.g).push(h);
    });
    const order = ['Part 1 话题', 'Part 2 题卡', 'Part 3 追问', '写作真题', '写作模板', '原作者笔记'];
    const html = `
      <div class="page-head"><div class="eyebrow">搜索</div><h1>“${esc(q)}”</h1><p class="lede">找到 ${hits.length} 条。</p></div>
      ${order
        .filter((g) => groups.has(g))
        .map((g) => {
          const list = groups.get(g);
          return `<h2 class="sec">${g}<span class="count">${list.length}</span></h2>${list
            .slice(0, 40)
            .map((h) => `<a class="result" href="${h.href}"><div class="t">${highlight(h.title, terms)}</div>${h.sub ? `<div class="s">${esc(h.sub)}</div>` : h.text && h.text !== h.title ? `<div class="s">${highlight(snippet(h.text, terms), terms)}</div>` : ''}</a>`)
            .join('')}${list.length > 40 ? `<p class="muted small">还有 ${list.length - 40} 条，换个更具体的词试试。</p>` : ''}`;
        })
        .join('') || '<p class="notice">没有找到。试试换个说法，或者只输入一个词。</p>'}`;
    return { title: `搜索 ${q}`, html, keepFocus: true };
  }

  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const v = searchInput.value.trim();
      const target = v ? `#/search?q=${encodeURIComponent(v)}` : '#/search';
      if (current().path === '/search') {
        history.replaceState(null, '', target);
        render();
      } else if (v) location.hash = target;
    }, 180);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.blur();
    }
  });

  // ---------- 来源与说明 ----------

  function viewAbout() {
    const srcList = (sources) =>
      Object.values(sources)
        .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>　<span class="muted small">${esc(s.date)}${s.note ? '　' + esc(s.note) : ''}</span></li>`)
        .join('');
    const html = `
      <div class="page-head"><div class="eyebrow">关于</div><h1>来源与说明</h1>
        <p class="lede">资料更新到 ${fmtDate(S.updated)}，网页生成于 ${fmtDate(DATA.built)}。</p></div>
      <h2 class="sec">怎么看这些题</h2>
      <ul>
        <li>题目是考生考后回忆整理的，不是雅思官方发布，英文措辞以考场为准。</li>
        <li>各家对“新题”的标注不一致，所以每道题都写了来源。“大陆新题”是新东方标注的大陆考区新题；“后续新增”是 9 月中旬以后才报告或进入高频的；“近期高频”来自 ${esc(S.hot.range)} 的考情周报。</li>
        <li>大陆考区和海外考区题库不完全相同，海外专属题单独列在页面最后。</li>
        <li>写作模板是通用结构和表达，示例段落除注明的真题外都是自拟的。</li>
      </ul>
      <h2 class="sec">口语题库来源</h2><ul>${srcList(S.sources)}</ul>
      <h2 class="sec">写作真题来源</h2><ul>${srcList(R.sources)}</ul>
      <h2 class="sec">原作者笔记</h2>
      <p>来自 <a href="${DATA.authorRepo}" target="_blank" rel="noopener">flamingoTOM/lxy_ILETS</a>，只收录做题技巧和口语素材。他的听阅错题和错因、自己写的作文和批改、自批改表格、讲义 PDF 和合并稿都没有放进来，每篇顶部的复习打卡表也去掉了。</p>
      <h2 class="sec">保存在这台设备上的数据</h2>
      <p>“练过”标记和考试日期存在浏览器本地（localStorage），不会上传；录音只在页面里，刷新就没了。${storageOk ? '' : '<b>当前浏览器不允许保存，刷新后标记会丢失。</b>'}</p>
      <p class="row"><button class="btn" type="button" id="clearBtn">清除练过标记</button><span class="muted small">已标记 ${Object.keys(done).length} 项</span></p>
      <h2 class="sec">更新内容</h2>
      <p>改 <code>data/speaking-2026-09.json</code>、<code>data/writing-recent-2026.json</code> 或 <code>笔记/</code>、<code>原作者笔记/</code> 下的 Markdown，然后运行 <code>npm run build</code>，会重新生成这个网页和 <code>笔记/</code> 里的口语新题、近期真题文件。</p>`;
    return {
      title: '来源与说明',
      html,
      after() {
        document.getElementById('clearBtn').onclick = () => {
          if (!confirm('清除所有“练过”标记？')) return;
          Object.keys(done).forEach((k) => delete done[k]);
          save('done', done);
          render();
          toast('已清除');
        };
      }
    };
  }

  function viewNotFound() {
    return { title: '找不到页面', html: '<div class="page-head"><h1>找不到这个页面</h1><p class="lede"><a href="#/">回到首页</a></p></div>' };
  }

  // ---------- 路由 ----------

  const routes = [
    [/^\/$/, viewHome],
    [/^\/p1$/, viewP1],
    [/^\/p2$/, viewP2],
    [/^\/p3$/, viewP3],
    [/^\/chuanti$/, viewChuanti],
    [/^\/practice$/, viewPractice],
    [/^\/writing$/, viewWriting],
    [/^\/w\/([\w-]+)$/, viewWritingType],
    [/^\/recent$/, viewRecent],
    [/^\/notes$/, viewNotes],
    [/^\/page\/([\w-]+)$/, viewPage],
    [/^\/search$/, viewSearch],
    [/^\/about$/, viewAbout]
  ];

  function current() {
    let raw = location.hash.replace(/^#/, '');
    try {
      raw = decodeURI(raw);
    } catch (e) {}
    raw = raw || '/';
    const qi = raw.indexOf('?');
    return { path: (qi < 0 ? raw : raw.slice(0, qi)) || '/', query: new URLSearchParams(qi < 0 ? '' : raw.slice(qi + 1)) };
  }

  function focusItem(id) {
    const el = main.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    if (el.tagName === 'DETAILS') el.open = true;
    el.scrollIntoView({ block: 'start' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function render() {
    const { path, query } = current();
    let view = viewNotFound;
    let params = [];
    for (const [re, fn] of routes) {
      const m = re.exec(path);
      if (m) {
        view = fn;
        params = m.slice(1);
        break;
      }
    }
    stopPractice();
    if (path !== '/search' && document.activeElement !== searchInput) searchInput.value = '';
    const out = view(params, query) || {};
    main.innerHTML = `<div class="page">${out.html || ''}</div>`;
    document.title = (out.title ? out.title + ' · ' : '') + '雅思补充 · 2026 年 9–12 月';
    renderToc(out.toc || []);
    markNav('#' + path);
    closeNav();
    if (out.after) out.after();
    const focus = query.get('focus');
    if (focus) requestAnimationFrame(() => focusItem(focus));
    else window.scrollTo(0, 0);
    if (!out.keepFocus && document.activeElement !== searchInput) main.focus({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-done]');
    if (d) {
      setDone(d.dataset.done, !isDone(d.dataset.done));
      return;
    }
    if (e.target.closest('[data-skip]')) {
      e.preventDefault();
      main.focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !isTyping(e.target)) {
      e.preventDefault();
      searchInput.focus();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === 'Escape') closeNav();
  });
  window.addEventListener('hashchange', render);

  buildNav();
  paintExam();
  render();
})();
