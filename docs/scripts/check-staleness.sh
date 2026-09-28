#!/bin/bash
# 知识库文档过期检查脚本
# 用法: bash scripts/check-staleness.sh [--full]
#
# 自动检测分类目录（NN-* 格式的目录），无需手动配置。

set -e

DOC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TODAY=$(date +%s)
WARN_DAYS=30
STALE_DAYS=90

FULL_MODE=false
if [ "$1" = "--full" ]; then
  FULL_MODE=true
fi

fresh=0
warn=0
stale=0
no_date=0
broken_links=0
total=0

warn_list=""
stale_list=""
no_date_list=""

while IFS= read -r file; do
  case "$file" in
    *维护制度*|*scripts/*|*README*|*AGENTS*) continue ;;
  esac

  total=$((total + 1))

  date_line=$(grep -m1 "最后验证" "$file" 2>/dev/null || echo "")

  if [ -z "$date_line" ]; then
    no_date=$((no_date + 1))
    no_date_list="$no_date_list\n  $file"
    continue
  fi

  date_str=$(echo "$date_line" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
  if [ -z "$date_str" ]; then
    no_date=$((no_date + 1))
    no_date_list="$no_date_list\n  $file (日期格式错误)"
    continue
  fi

  file_date=$(date -d "$date_str" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$date_str" +%s 2>/dev/null)
  age=$(( (TODAY - file_date) / 86400 ))

  if [ $age -gt $STALE_DAYS ]; then
    stale=$((stale + 1))
    stale_list="$stale_list\n  [${age}天] $file"
  elif [ $age -gt $WARN_DAYS ]; then
    warn=$((warn + 1))
    warn_list="$warn_list\n  [${age}天] $file"
  else
    fresh=$((fresh + 1))
  fi
done < <(find "$DOC_DIR" -name "*.md" -not -path "*/.git/*" | sort)

if $FULL_MODE; then
  while IFS= read -r file; do
    links=$(grep -oE '\]\([^)]+\.md\)' "$file" 2>/dev/null | sed 's/\](//;s/)//' || echo "")
    for link in $links; do
      case "$link" in
        http*|//*) continue ;;
      esac
      dir=$(dirname "$file")
      target="$dir/$link"
      if [ ! -f "$target" ]; then
        broken_links=$((broken_links + 1))
        echo "  [断链] $file → $link"
      fi
    done
  done < <(find "$DOC_DIR" -name "*.md" -not -path "*/.git/*")
fi

echo "======================================"
echo "  知识库健康检查报告"
echo "======================================"
echo ""
echo "文档总数: $total"
echo "  新鲜 (≤${WARN_DAYS}天): $fresh"
echo "  需复查 (${WARN_DAYS}-${STALE_DAYS}天): $warn"
echo "  可能过期 (>${STALE_DAYS}天): $stale"
echo "  缺少验证日期: $no_date"

if $FULL_MODE; then
  echo "  断链数: $broken_links"
fi

freshness=0
if [ $total -gt 0 ]; then
  freshness=$(( fresh * 100 / total ))
fi
echo ""
echo "文档新鲜度: ${freshness}%"

if [ $warn -gt 0 ]; then
  echo ""
  echo "--- 需复查 ---"
  echo -e "$warn_list"
fi

if [ $stale -gt 0 ]; then
  echo ""
  echo "--- 可能过期 ---"
  echo -e "$stale_list"
fi

if [ $no_date -gt 0 ]; then
  echo ""
  echo "--- 缺少验证日期 ---"
  echo -e "$no_date_list"
fi

echo ""
if [ $stale -eq 0 ] && [ $no_date -eq 0 ]; then
  echo "状态: OK"
  exit 0
else
  echo "状态: 需要关注"
  exit 1
fi
