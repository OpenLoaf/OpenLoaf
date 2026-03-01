#!/bin/bash
# OpenLoaf i18n Batch Migration Automation Script
# 为优先级 1-4 的组件自动执行 i18n 迁移

set -e

echo "🚀 OpenLoaf i18n 批量迁移自动化脚本"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 优先级 1 组件（导航、工作空间）
PRIORITY_1=(
  "apps/web/src/components/layout/sidebar/SidebarProject.tsx"
  "apps/web/src/components/workspace/SidebarWorkspace.tsx"
)

# 优先级 2 组件（AI 对话）
PRIORITY_2=(
  "apps/web/src/components/ai/Chat.tsx"
  "apps/web/src/components/ai/input/ChatInput.tsx"
  "apps/web/src/components/ai/message/MessageHelper.tsx"
  "apps/web/src/components/ai/input/ApprovalModeSelector.tsx"
)

# 优先级 3 组件（设置页）
PRIORITY_3=(
  "apps/web/src/components/setting/menus/Workspace.tsx"
  "apps/web/src/components/setting/menus/provider/ProviderDialog.tsx"
  "apps/web/src/components/setting/menus/ThirdPartyTools.tsx"
  "apps/web/src/components/setting/menus/KeyboardShortcuts.tsx"
  "apps/web/src/components/setting/menus/LocalAccess.tsx"
)

# 优先级 4 组件（功能模块）
PRIORITY_4=(
  "apps/web/src/components/tasks/TaskBoardPage.tsx"
  "apps/web/src/components/board/toolbar/BoardToolbar.tsx"
)

# 函数：检查文件是否存在并已导入 i18n
check_and_update_file() {
  local file=$1
  local namespace=$2

  if [ ! -f "$file" ]; then
    echo -e "${YELLOW}⚠️  文件不存在: $file${NC}"
    return 1
  fi

  # 检查是否已经导入 useTranslation
  if ! grep -q "useTranslation" "$file"; then
    echo -e "${GREEN}✓ 文件待迁移: $file${NC}"
    return 0
  else
    echo -e "${YELLOW}✓ 文件已导入 i18n: $file${NC}"
    return 1
  fi
}

# 统计待迁移文件
echo "📋 待迁移文件清单："
echo ""
echo "优先级 1 (导航、工作空间):"
for file in "${PRIORITY_1[@]}"; do
  check_and_update_file "$file" "nav"
done

echo ""
echo "优先级 2 (AI 对话):"
for file in "${PRIORITY_2[@]}"; do
  check_and_update_file "$file" "ai"
done

echo ""
echo "优先级 3 (设置页):"
for file in "${PRIORITY_3[@]}"; do
  check_and_update_file "$file" "settings"
done

echo ""
echo "优先级 4 (功能模块):"
for file in "${PRIORITY_4[@]}"; do
  check_and_update_file "$file" "tasks"
done

echo ""
echo "========================================"
echo "📌 迁移指南："
echo "1. 对于每个文件，按照 COMPONENT_MIGRATION_ROADMAP.md 的 Phase 1-5"
echo "2. 导入 useTranslation hook 和正确的 namespace"
echo "3. 替换所有硬编码的中文文本为 t() 调用"
echo "4. 新增 key 到所有 3 个语言的翻译文件"
echo "5. git commit 并遵循规范的 commit message"
echo ""
echo "✨ 建议使用此脚本验证迁移进度，然后继续手工迁移剩余文件。"
