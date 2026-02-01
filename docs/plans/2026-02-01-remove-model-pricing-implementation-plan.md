# Remove Model Pricing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除项目中所有模型价格数据与相关逻辑（registry、设置 UI、消息统计）。

**Architecture:** 删除 model pricing 类型与工具函数；清理 provider registry 的价格字段；移除设置界面里价格输入与展示；移除聊天消息里费用计算与展示。

**Tech Stack:** TypeScript, React/Next.js, pnpm, JSON model registry.

> 备注：根据项目规则，不创建 worktree，且跳过 TDD 测试执行。

### Task 1: 清理通用类型与导出

**Files:**
- Modify: `packages/api/src/common/modelTypes.ts`
- Delete: `packages/api/src/common/modelPricing.ts`
- Modify: `packages/api/src/common/index.ts`

**Step 1: (跳过) 编写失败测试**

**Step 2: (跳过) 运行测试验证失败**

**Step 3: 删除价格相关类型/导出**

**Step 4: (跳过) 运行测试验证通过**

**Step 5: (可选) Commit**

### Task 2: 移除 provider registry 的价格字段

**Files:**
- Modify: `apps/web/src/lib/model-registry/providers/*.json`

**Step 1: (跳过) 编写失败测试**

**Step 2: (跳过) 运行测试验证失败**

**Step 3: 删除 priceStrategyId/priceTiers/currencySymbol 字段**

**Step 4: (跳过) 运行测试验证通过**

**Step 5: (可选) Commit**

### Task 3: 移除设置界面的价格编辑与展示

**Files:**
- Modify: `apps/web/src/components/setting/menus/provider/use-provider-management.ts`
- Modify: `apps/web/src/components/setting/menus/provider/ModelDialog.tsx`
- Modify: `apps/web/src/components/setting/menus/provider/ProviderDialog.tsx`
- Modify: `apps/web/src/components/setting/menus/provider/ProviderManagement.tsx`

**Step 1: (跳过) 编写失败测试**

**Step 2: (跳过) 运行测试验证失败**

**Step 3: 移除 draft 价格状态、校验与展示逻辑**

**Step 4: (跳过) 运行测试验证通过**

**Step 5: (可选) Commit**

### Task 4: 移除消息中的费用计算与展示

**Files:**
- Modify: `apps/web/src/components/chat/message/MessageAiAction.tsx`

**Step 1: (跳过) 编写失败测试**

**Step 2: (跳过) 运行测试验证失败**

**Step 3: 删除费用计算/格式化逻辑，仅保留 token 用量**

**Step 4: (跳过) 运行测试验证通过**

**Step 5: (可选) Commit**

### Task 5: 收尾检查

**Files:**
- Check: 全仓 `rg "priceStrategyId|priceTiers|currencySymbol|estimateModelPrice|resolvePriceTier"`

**Step 1: (跳过) 编写失败测试**

**Step 2: (跳过) 运行测试验证失败**

**Step 3: 清理残余引用**

**Step 4: (跳过) 运行测试验证通过**

**Step 5: (可选) Commit**
