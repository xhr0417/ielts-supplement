#!/usr/bin/env bash
# 发布：生成网页 → 同步到自有服务器（ielts.xhr0417.cn）→ 推送 GitHub（Pages 镜像随 push 更新）
# 用法：bash scripts/publish.sh "更新说明（可选）"
set -e
cd "$(dirname "$0")/.."

MSG="${1:-update: $(date '+%Y-%m-%d %H:%M')}"

echo "==> [1/3] 生成网页"
node scripts/build.mjs

echo "==> [2/3] 同步到服务器"
if rsync -az --delete --exclude='.DS_Store' site/ myserver:/var/www/ielts/; then
  echo "    服务器已更新：https://ielts.xhr0417.cn/"
else
  echo "    rsync 失败，没有推送 GitHub" >&2
  exit 1
fi

echo "==> [3/3] 推送到 GitHub"
git add -A
if git diff --cached --quiet; then
  echo "    没有新变化，跳过提交"
else
  git commit -m "$MSG"
fi
if ! git push; then
  echo "    git push 失败：服务器已经是新版本，GitHub 和 Pages 镜像还是旧的。修好网络后再执行 git push" >&2
  exit 1
fi

echo "完成：https://ielts.xhr0417.cn/ ，镜像 https://xhr0417.github.io/ielts-supplement/"
