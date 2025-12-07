## 实现 Tab 管理功能

### 1. 创建 header-tabs 组件
- **文件路径**: `/apps/web/src/components/layout/header-tabs.tsx`
- **功能**: 显示和管理打开的标签页
- **实现**: 
  - 使用 `Tabs` 组件实现标签页导航
  - 支持关闭标签页功能
  - 从 `useTabs` hook 获取数据

### 2. 创建 use_tabs.ts hook
- **文件路径**: `/apps/web/src/hooks/use-tabs.ts`
- **功能**: 管理标签页状态
- **实现**: 
  - 使用 `zustand` 创建状态管理
  - 支持添加、关闭、切换标签页
  - 存储当前选中的标签页

### 3. 修改 page tree 组件
- **文件路径**: `/apps/web/src/components/page/tree.tsx`
- **功能**: 处理页面项点击事件
- **实现**: 
  - 添加点击事件处理器
  - 调用 `useTabs` hook 添加/切换标签页
  - 更新页面选择状态

### 4. 修改 editor 组件
- **文件路径**: `/apps/web/src/components/edit/editor.tsx`
- **功能**: 显示当前选中页面的标题
- **实现**: 
  - 从 `useTabs` hook 获取当前选中页面
  - 仅显示页面标题

### 5. 整合组件
- **文件路径**: `/apps/web/src/components/layout/header.tsx`
- **功能**: 嵌入 header-tabs 组件
- **实现**: 
  - 导入并使用 header-tabs 组件
  - 调整布局以适应标签页

### 6. 连接页面显示
- **文件路径**: `/apps/web/src/app/page.tsx`
- **功能**: 确保 editor 组件正确显示
- **实现**: 
  - 确保 Editor 组件正确导入和使用

### 技术栈和依赖
- 使用现有的 `zustand` 进行状态管理
- 使用现有的 `Tabs` UI 组件
- 遵循最小化 MVP 原则，只实现核心功能

### 实现步骤
1. 首先创建 `use_tabs.ts` hook
2. 然后创建 `header-tabs.tsx` 组件
3. 修改 `header.tsx` 嵌入标签页组件
4. 修改 `tree.tsx` 添加点击事件
5. 最后修改 `editor.tsx` 显示标题

### 预期效果
- 点击页面树中的页面项，会在顶部添加/切换标签页
- 顶部标签页可以关闭
- 编辑器区域显示当前选中页面的标题