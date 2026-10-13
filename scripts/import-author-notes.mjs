// 从原作者仓库（flamingoTOM/lxy_ILETS）的本地克隆里导入通用笔记到 原作者笔记/。
// 用法：node scripts/import-author-notes.mjs /path/to/lxy_ILETS
//
// 只导入做题技巧和口语素材。原作者的个人记录不导入：
//   笔记/1-做题记录/（听阅错题与错因）、笔记/作文/做题记录/（作文批改）、
//   语料库自批改表格、讲义 PDF、merged_all 合并稿。
// 每篇顶部的 review record 复习打卡表也会去掉。

import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, '笔记'))) {
  console.error('用法：node scripts/import-author-notes.mjs /path/to/lxy_ILETS');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const outRoot = path.join(root, '原作者笔记');
const folders = ['笔记/口语/P1', '笔记/口语/P2', '笔记/口语/P3', '笔记/作文/做题技巧'];
const skip = new Set(['merged_all.md']);

function stripReviewTable(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*review record\s*\|/i.test(lines[i])) {
      if (i + 1 < lines.length && /^\|\s*-{3,}/.test(lines[i + 1])) i++;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n').replace(/^\s*\n+/, '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

let copied = 0;
for (const folder of folders) {
  const dir = path.join(src, folder);
  const dest = path.join(outRoot, folder.replace(/^笔记\//, ''));
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.md') || skip.has(name)) continue;
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    if (raw.trim().length < 2) continue;
    fs.writeFileSync(path.join(dest, name), stripReviewTable(raw));
    copied++;
  }
}
console.log(`导入 ${copied} 篇到 ${path.relative(root, outRoot)}/`);
