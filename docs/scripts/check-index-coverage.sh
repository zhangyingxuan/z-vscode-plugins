#!/usr/bin/env bash
# 索引覆盖检查脚本
# 验证每个分类目录下的 .md 文件都被该目录的 _index.md 引用
# 用法: bash scripts/check-index-coverage.sh
#
# 自动检测分类目录（NN-* 格式的目录），无需手动配置。

set -euo pipefail

DOCS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXIT_CODE=0
TOTAL=0
INDEXED=0

# 自动发现分类目录（NN-* 格式，如 01-需求分析、02-业务梳理）
CATEGORIES=()
for dir in "$DOCS_DIR"/[0-9][0-9]-*/; do
    if [ -d "$dir" ]; then
        cat_name=$(basename "$dir")
        CATEGORIES+=("$cat_name")
    fi
done

if [ ${#CATEGORIES[@]} -eq 0 ]; then
    echo "ERROR: 未找到分类目录（NN-* 格式）"
    exit 1
fi

for cat in "${CATEGORIES[@]}"; do
    cat_dir="$DOCS_DIR/$cat"
    index_file="$cat_dir/_index.md"

    if [ ! -f "$index_file" ]; then
        echo "ERROR: 缺少索引文件: $cat/_index.md"
        EXIT_CODE=1
        continue
    fi

    while IFS= read -r md_file; do
        TOTAL=$((TOTAL + 1))
        rel_to_cat="${md_file#$cat_dir/}"
        if grep -q "$rel_to_cat" "$index_file"; then
            INDEXED=$((INDEXED + 1))
        else
            echo "MISSING: $cat/$rel_to_cat 未在 $cat/_index.md 中引用"
            EXIT_CODE=1
        fi
    done < <(find "$cat_dir" -name "*.md" -not -name "_index.md" | sort)
done

if [ $EXIT_CODE -eq 0 ]; then
    echo "OK: 所有 $INDEXED 个文档文件均已在 _index.md 中注册"
else
    echo ""
    echo "覆盖率: $INDEXED / $TOTAL"
fi

exit $EXIT_CODE
