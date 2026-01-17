# Project Basic Settings: rename, storage move, chat cleanup

## 背景
项目设置页需要将“项目名称/存储路径”从输入框改为文本展示并提供编辑按钮；存储路径允许选择目标父目录并执行移动；同时移除缓存路径展示，并新增项目级 AI 聊天记录数量与清空功能。目标是与侧边栏重命名体验一致、操作更安全、并保证文件/数据库/运行时配置一致。

## 目标
- “项目名称”展示为文本，点击“修改”弹出重命名对话框并调用 `project.update`。
- “存储路径”展示为文本，点击“修改”选择目标父目录并确认迁移。
- 移除“缓存路径”一行。
- 新增“AI 聊天记录数量”展示与清空按钮，含强提醒确认。

## 非目标
- 不做历史记录回放或恢复。
- 不增加新的跨端同步协议。

## 前端改动
- `ProjectBasicSettings.tsx`：文本展示 + 操作按钮；重命名弹窗复用 `ProjectTree` 结构。
- 存储路径迁移：调用 Electron `pickDirectory` 选择目标父目录；AlertDialog 展示当前路径、目标父目录、迁移后路径；确认后展示模拟进度条（0→90→100）。
- AI 聊天记录：展示数量 + “清空”按钮；AlertDialog 二次确认；成功后刷新数量与会话列表。

## 后端改动
- 新增服务函数 `moveProjectStorage()`：
  - 校验 `projectId`、当前 `rootUri`。
  - 将目标父目录与当前项目文件夹名拼接得到目标路径。
  - 若目标路径已存在则直接报错。
  - 先移动目录：`fs.rename`，遇 `EXDEV` 则 `fs.cp` + `fs.rm`。
  - 更新运行时 `workspaces.json`（通过 `upsertActiveWorkspaceProject` 或父项目 `project.json` 的 `projects` 映射）。
  - 调用 `syncWorkspaceProjectsFromDisk` 同步数据库 `Project.rootUri`。
- 新增服务函数 `clearProjectChatData()`：
  - 删除项目根目录 `.tenas/chat`。
  - 清理数据库中该项目的 `ChatSession` 与 `ChatMessage`（依赖级联删除）。
- 新增 tRPC：
  - `project.moveStorage` -> 调用 `moveProjectStorage`。
  - `chat.getProjectChatStats` -> 返回项目会话数。
  - `chat.clearProjectChat` -> 调用 `clearProjectChatData`。

## 数据流
1. 前端选择父目录并确认。
2. `project.moveStorage` 执行移动并更新配置与数据库。
3. 前端收到新 `rootUri`，刷新项目信息与列表。
4. 清空聊天时调用 `chat.clearProjectChat`，完成后刷新数量与会话列表。

## 错误处理
- 选择目录取消：无状态变化。
- 目标目录已存在：返回错误，前端 toast 提示。
- 移动失败：不更新配置与数据库，返回错误。
- `.tenas/chat` 不存在：视为成功。

## 测试建议
- 目标目录已存在时报错。
- 跨盘移动成功（`EXDEV` 分支）。
- 移动完成后 UI 路径与数据库一致。
- 清空聊天后数量归零，会话列表刷新。
- 非 Electron 环境提示不可选择目录。
