#!/bin/sh
# CoC 跑团改造包 安装脚本 — 从公开的 fork 仓库拉取改造后的文件
# 用法：把 install.sh 放到官方项目根目录，执行  sh install.sh
# 需要 curl（macOS/Linux 自带；Windows 建议在 Git Bash / WSL 里跑）
set -e
BASE=https://raw.githubusercontent.com/suniorashli/momo.float.phone/main
FILES="
lib/coc-sheet.ts
lib/map-types.ts
lib/map-storage.ts
lib/map-rpg-engine.ts
lib/module-core.ts
lib/stage-assets.ts
lib/investigator-import.ts
components/map/map-lobby.tsx
components/map/map-view.tsx
"
echo "== CoC 跑团改造包：从 fork 仓库拉取 9 个文件 =="
for f in $FILES; do
  mkdir -p "$(dirname "$f")"
  echo "下载 $f"
  curl -sf "$BASE/$f" -o "$f" || { echo "!! 下载失败：$f（检查网络或仓库是否公开）"; exit 1; }
done
echo ""
echo "== 完成。下一步："
echo "   1. 提交这些文件并部署（Netlify/Vercel）"
echo "   2. 部署后进「冒险 → 冒险设置」，重置「场景生成」「裁决」「世界生成」三个提示词"
