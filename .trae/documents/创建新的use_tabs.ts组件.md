## 创建新的use_tabs.ts组件

### 1. 设计新的标签页类型
- 定义`Tab`接口，包含id、title以及左右面板的组件和参数配置
- 左右面板支持动态组件类型和不固定参数格式

### 2. 实现状态管理
- 使用zustand创建状态管理store
- 支持持久化存储
- 实现核心功能：
  - `addTab`：支持替换当前tab或创建新tab
  - `closeTab`：关闭标签页
  - `setActiveTab`：切换活跃标签页
  - `updateCurrentTabPanels`：更新当前tab的左右面板参数
  - `updateTabPanels`：更新指定tab的左右面板参数
  - `getTabById`：根据id获取标签页

### 3. 创建新文件
- 在`src/hooks`目录下创建`use_tabs.ts`文件
- 实现完整的标签页管理逻辑

### 4. 核心实现要点
- 标签页参数使用`Record<string, any>`支持任意格式
- 默认情况下addTab会替换当前活跃tab，可通过参数控制是否创建新tab
- 支持动态更新标签页的左右面板配置
- 保持与原有use_tabs_old.ts相似的API设计，便于迁移使用