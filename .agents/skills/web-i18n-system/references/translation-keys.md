# OpenLoaf i18n Complete Key Directory

## Overview

本文档列出所有已定义的翻译 key，按 namespace 组织。**在添加新 key 前，先检查是否已存在相似的 key，避免重复定义。**

---

## common.json — 通用词汇

这个 namespace 包含所有页面都可能用到的通用操作和提示文本。

### 按钮 & 操作
- `save` — 保存
- `cancel` — 取消
- `delete` — 删除
- `confirm` — 确认
- `create` — 创建
- `edit` — 编辑
- `copy` — 复制
- `back` — 返回
- `close` — 关闭
- `refresh` — 刷新
- `submit` — 提交
- `export` — 导出
- `import` — 导入
- `search` — 搜索
- `clear` — 清除
- `reset` — 重置
- `select` — 选择
- `apply` — 应用
- `download` — 下载
- `upload` — 上传
- `rename` — 重命名
- `duplicate` — 复制副本

### 状态 & 反馈
- `loading` — 加载中…
- `saving` — 保存中…
- `creating` — 创建中…
- `deleting` — 删除中…
- `submitting` — 提交中…
- `copied` — 已复制
- `copyFailed` — 复制失败
- `success` — 成功
- `failed` — 失败
- `error` — 错误
- `warning` — 警告
- `info` — 信息
- `noData` — 暂无数据
- `empty` — 为空
- `loading` — 加载中

### 通用错误消息
- `saveFailed` — 保存失败
- `deleteFailed` — 删除失败
- `createFailed` — 创建失败
- `networkError` — 网络错误
- `operationFailed` — 操作失败
- `unsavedChanges` — 您有未保存的更改
- `confirmDelete` — 确定要删除吗？此操作无法撤销

### 时间相关
- `today` — 今天
- `tomorrow` — 明天
- `yesterday` — 昨天
- `thisWeek` — 本周
- `thisMonth` — 本月
- `now` — 现在
- `ago` — 前

---

## nav.json — 侧边栏导航

侧边栏和主导航菜单的所有文本。

### 主导航
- `search` — 搜索
- `aiAssistant` — AI 助手
- `workbench` — 工作台
- `calendar` — 日历
- `email` — 邮箱
- `tasks` — 任务
- `settings` — 设置

### 侧边栏项目
- `sidebar.projectFolder` — 项目文件夹
- `sidebar.refresh` — 刷新
- `sidebar.addProject` — 添加项目
- `sidebar.newEmptyProject` — 新建空项目
- `sidebar.selectExistingFolder` — 选择已有文件夹
- `sidebar.projectName` — 项目名称
- `sidebar.projectNamePlaceholder` — 我的项目
- `sidebar.feedback` — 反馈

### 工作空间菜单
- `workspace.title` — 工作空间
- `workspace.selectWorkspace` — 选择工作空间
- `workspace.createWorkspace` — 新建工作空间
- `workspace.workspaceSettings` — 工作空间设置
- `workspace.exitWorkspace` — 退出工作空间

---

## ai.json — AI 对话界面

AI 聊天、代理、模型相关的所有 UI 文本。

### 聊天界面基础
- `chat.newChat` — 新对话
- `chat.placeholder` — 输入您的问题…
- `chat.send` — 发送
- `chat.clear` — 清除对话
- `chat.selectModel` — 选择模型
- `chat.modelNotSelected` — 未选择模型

### 消息相关
- `message.userMessage` — 用户消息
- `message.aiMessage` — AI 消息
- `message.copying` — 复制中…
- `message.copy` — 复制代码
- `message.copied` — 已复制
- `message.delete` — 删除消息
- `message.retry` — 重试
- `message.likeThis` — 赞同
- `message.dislikeThis` — 不赞同

### 模式 & 配置
- `mode.approval` — 审批模式
- `mode.analysis` — 分析模式
- `mode.brainstorm` — 头脑风暴
- `mode.execute` — 执行模式
- `mode.selectMode` — 选择对话模式
- `approvalRequired` — 需要批准
- `approvalPending` — 待批准
- `approvalApproved` — 已批准
- `approvalRejected` — 已拒绝

### 能力 & 工具
- `capability.browse` — 网页浏览
- `capability.search` — 搜索
- `capability.vision` — 图像识别
- `capability.code` — 代码执行
- `capability.fileManager` — 文件管理
- `capability.emailManager` — 邮件管理
- `capability.calendarManager` — 日历管理
- `capability.terminalEmulator` — 终端模拟
- `tools.availableTools` — 可用工具

### 设置 & 配置
- `aiModel.openaiKey` — OpenAI API Key
- `aiModel.anthropicKey` — Anthropic API Key
- `aiModel.googleKey` — Google API Key
- `aiModel.deepseekKey` — DeepSeek API Key
- `aiModel.qwenKey` — Qwen API Key
- `aiModel.xaiKey` — xAI API Key

---

## settings.json — 设置页

所有设置页面、偏好项、配置相关的文本。

### 基础设置
- `basic.language` — 语言
- `basic.theme` — 主题
- `basic.appearance` — 外观
- `basic.lightMode` — 亮色
- `basic.darkMode` — 深色
- `basic.autoMode` — 自动
- `basic.fontSize` — 字体大小
- `basic.editorFont` — 编辑器字体

### 工作空间设置
- `workspace.name` — 工作空间名称
- `workspace.location` — 位置
- `workspace.created` — 创建于
- `workspace.lastModified` — 最后修改
- `workspace.delete` — 删除工作空间
- `workspace.settings` — 工作空间设置
- `workspace.clearedSessions` — 已清除 {{count}} 个会话

### 关于
- `about.version` — 版本
- `about.openloafVersion` — OpenLoaf 版本
- `about.checkForUpdates` — 检查更新
- `about.updateAvailable` — 有可用更新
- `about.latestVersion` — 已是最新版本

### 第三方服务
- `thirdParty.title` — 第三方服务
- `thirdParty.provider` — 服务提供者
- `thirdParty.key` — API Key
- `thirdParty.configureProviders` — 配置提供者
- `thirdParty.addProvider` — 添加提供者
- `thirdParty.removeProvider` — 移除提供者
- `thirdParty.testConnection` — 测试连接

### 快捷键
- `shortcuts.title` — 快捷键
- `shortcuts.keyboardShortcuts` — 键盘快捷键
- `shortcuts.command` — 命令
- `shortcuts.key` — 快捷键
- `shortcuts.resetToDefaults` — 重置为默认值

### 本地访问
- `localAccess.title` — 本地访问
- `localAccess.enableLocalServer` — 启用本地服务器
- `localAccess.serverAddress` — 服务器地址
- `localAccess.port` — 端口
- `localAccess.authentication` — 认证

---

## workspace.json — 工作空间管理

工作空间操作、文件管理、选项卡相关文本。

### 工作空间操作
- `workspace.create` — 创建工作空间
- `workspace.open` — 打开工作空间
- `workspace.selectProject` — 选择项目
- `workspace.newProject` — 新建项目
- `workspace.projectList` — 项目列表
- `workspace.recent` — 最近使用

### 文件管理
- `file.name` — 文件名
- `file.type` — 文件类型
- `file.size` — 大小
- `file.modified` — 修改时间
- `file.create` — 创建文件
- `file.delete` — 删除文件
- `file.rename` — 重命名文件
- `file.upload` — 上传文件
- `file.download` — 下载文件
- `file.move` — 移动文件
- `file.copy` — 复制文件
- `folder.create` — 创建文件夹
- `folder.delete` — 删除文件夹
- `folder.rename` — 重命名文件夹

### 选项卡 & 编辑器
- `tab.new` — 新建标签页
- `tab.close` — 关闭标签页
- `tab.closeOther` — 关闭其他标签页
- `tab.closeAll` — 关闭所有标签页
- `tab.pin` — 固定标签页
- `tab.unsaved` — 未保存

---

## tasks.json — 任务管理

任务看板、任务详情、日程管理相关文本。

### 任务基础
- `task.title` — 标题
- `task.description` — 描述
- `task.status` — 状态
- `task.priority` — 优先级
- `task.dueDate` — 截止日期
- `task.assignee` — 分配给
- `task.create` — 创建任务
- `task.edit` — 编辑任务
- `task.delete` — 删除任务

### 任务状态
- `taskStatus.todo` — 待办
- `taskStatus.inProgress` — 进行中
- `taskStatus.inReview` — 审核中
- `taskStatus.done` — 已完成
- `taskStatus.archived` — 已归档
- `taskStatus.cancelled` — 已取消

### 优先级
- `priority.high` — 高
- `priority.medium` — 中
- `priority.low` — 低
- `priority.urgent` — 紧急

### 看板视图
- `board.title` — 任务看板
- `board.myTasks` — 我的任务
- `board.allTasks` — 所有任务
- `board.filterByAssignee` — 按分配者筛选
- `board.filterByPriority` — 按优先级筛选
- `board.filterByStatus` — 按状态筛选
- `board.addColumn` — 添加列
- `board.deleteColumn` — 删除列

### 日程
- `schedule.title` — 日程表
- `schedule.todayTasks` — 今日任务
- `schedule.upcomingTasks` — 即将任务
- `schedule.overdueTasks` — 逾期任务
- `schedule.scheduledFor` — 计划于
- `schedule.reminder` — 提醒

---

## board.json — 画板工具

画布、画板工具栏相关文本。

### 工具栏
- `toolbar.select` — 选择工具
- `toolbar.pen` — 笔
- `toolbar.eraser` — 橡皮擦
- `toolbar.line` — 直线
- `toolbar.shape` — 形状
- `toolbar.text` — 文字
- `toolbar.color` — 颜色
- `toolbar.fontSize` — 字体大小
- `toolbar.strokeWidth` — 笔触宽度
- `toolbar.undo` — 撤销
- `toolbar.redo` — 重做
- `toolbar.clear` — 清空画布
- `toolbar.save` — 保存
- `toolbar.export` — 导出

### 画布
- `canvas.title` — 画布
- `canvas.background` — 背景
- `canvas.grid` — 网格
- `canvas.snap` — 吸附
- `canvas.zoom` — 缩放
- `canvas.reset` — 重置视图

---

## Key 添加检查清单

新增 key 时，请按以下步骤操作：

1. ✅ 选择正确的 namespace（参考上表）
2. ✅ 在 `locales/zh-CN/namespace.json` 中添加简体中文文本
3. ✅ 在 `locales/zh-TW/namespace.json` 中添加繁体中文文本（参考术语表）
4. ✅ 在 `locales/en-US/namespace.json` 中添加英文文本
5. ✅ 本文档中记录新增 key（便于团队和未来查找）
6. ✅ 在组件中通过 `t('key')` 引用

**如有重复定义的 key 被发现**，应立即合并并更新引用。
