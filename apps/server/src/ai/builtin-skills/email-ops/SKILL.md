---
name: email-ops
description: 邮件收发与管理——收件箱、未读、回复、转发、撰写、发送、草稿、搜索邮件、归档、星标、订阅邮件、垃圾邮件处理、contact someone、reach out、let them know、follow up、notify、forward、CC me、unsubscribe、attachment、mailing list。当用户提到邮件、inbox、消息、写信、查信、"有没有人给我发过消息"等任何与电子邮件相关的意图时激活。
---

# 邮件操作技能

你有两个工具：`email-query`（只读，无需审批）和 `email-mutate`（写入，send/delete/move 需审批）。

## 我该用哪个查询模式？

按你的目的选择——不要盲猜：

```
想知道有多少未读？          → unread-stats
想看统一收件箱？            → list-unified (scope: all-inboxes)
想看已发送/草稿/星标？      → list-unified (scope: sent/drafts/flagged)
想在特定邮箱文件夹里翻邮件？ → list-messages (需要 accountEmail + mailbox)
想按关键词/发件人搜索？     → search (query 支持自然语言)
想读一封邮件的完整正文？    → get-message (需要 messageId)
不知道用户配了哪些邮箱账户？ → list-accounts（永远先调这个来获取 accountEmail）
需要知道有哪些文件夹？      → list-mailboxes
```

所有列表模式支持 `cursor` + `pageSize`(1-50) 分页。

## 核心工作流

### 流程一：查看并回复邮件

```
1. list-accounts                → 拿到可用的 accountEmail
2. list-unified (all-inboxes)   → 看收件箱概览
3. get-message (messageId)      → 读取需要回复的那封邮件完整内容
4. 草拟回复
5. ⚠️ AskUserQuestion        → 把草稿展示给用户确认
6. send (带 inReplyTo + references) → 用户确认后才发送
```

**第 5 步为什么必须做？** 因为邮件一旦发出就无法撤回。发错人、写错内容可能造成不可逆的尴尬甚至商业损失。永远让用户亲眼确认收件人、主题和正文后再发送。

**第 6 步为什么必须带 `inReplyTo`？** 因为不带它，回复会在收件人邮箱里变成一封独立新邮件，脱离原始对话线程。所有主流邮件客户端（Gmail、Outlook、Apple Mail）都依赖 Message-ID 头来组织会话。`inReplyTo` 填原邮件的 `messageId`，`references` 填原邮件的 references 链 + 原邮件 messageId。

### 流程二：撰写新邮件

```
1. list-accounts                → 确认从哪个账户发
2. 根据用户意图草拟邮件
3. ⚠️ AskUserQuestion        → 展示完整邮件让用户确认
4. send                         → 确认后发送
```

### 流程三：搜索并批量整理

```
1. search (query: "newsletter")  → 找到所有匹配邮件
2. 向用户汇报搜索结果摘要
3. batch-move / batch-delete     → 按用户指示批量操作
```

**大结果集处理**：搜索可能返回大量结果。遵循以下原则：
- 先用 `pageSize: 20` 获取第一页，向用户汇报总数和样本
- 让用户确认操作范围后再批量执行，避免误操作
- 分批处理（每批不超过 50 条），每批操作间向用户汇报进度
- **警惕误判**：搜索结果可能包含不相关邮件（如搜 "newsletter" 可能匹配到正文提及 newsletter 的正常邮件）。批量删除前务必让用户审核样本

### 流程四：每日邮件摘要

```
1. unread-stats                  → 快速了解各账户未读量
2. list-unified (all-inboxes, pageSize: 20) → 获取最新邮件列表
3. 对重要邮件逐一 get-message    → 读取详情
4. 生成结构化摘要（按紧急度/发件人分组）
```

## 转发邮件

转发邮件没有独立的 `forward` 动作，使用 `send` 实现：

1. `get-message` 获取原邮件完整内容
2. 构造新邮件：`to` 填转发目标，`subject` 加 `Fwd:` 前缀，`bodyText` 包含原邮件内容（添加 "---------- Forwarded message ----------" 分隔头和原始发件人/日期/主题信息）
3. 通过 `AskUserQuestion` 让用户确认后 `send`

## 附件说明

当前版本**不支持邮件附件**的发送和下载。如果用户要求：
- 发送附件 → 告知"当前版本不支持通过 AI 发送邮件附件，建议通过邮件客户端（如 Gmail、Outlook）直接操作"
- 下载附件 → 同上，引导用户在邮件客户端中操作

## 邮件格式说明

`send` 动作的 `bodyText` 参数为**纯文本格式**，不支持 HTML。如果用户要求富文本格式（加粗、图片、表格等），告知当前仅支持纯文本，复杂格式建议在邮件客户端中编辑。

## 常见错误——你必须避免

1. **发邮件前没调 `AskUserQuestion`**：这是最严重的错误。永远不要自作主张发送邮件。
2. **回复邮件没设 `inReplyTo`**：线程会断裂，收件人看到的是孤立的新邮件。
3. **不知道 `accountEmail` 就瞎调**：很多操作需要 `accountEmail`。如果不确定，先 `list-accounts`。
4. **把密码、密钥、凭证写进邮件正文**：永远不要这样做。
5. **回复时忘记带 `Re:` 前缀**：subject 应保持 `Re: 原主题` 格式以维持线程显示。
6. **转发时忘记带 `Fwd:` 前缀**：subject 应保持 `Fwd: 原主题` 格式。
7. **批量操作前未让用户确认样本**：大批量删除/移动前必须展示样本，防止误删重要邮件。

## 操作速查

**email-query** 7 种模式：`list-accounts` · `list-mailboxes` · `list-messages` · `list-unified` · `get-message` · `search` · `unread-stats`

**email-mutate** 8 种动作：`send` · `mark-read` · `flag` · `delete` · `move` · `batch-mark-read` · `batch-delete` · `batch-move`

发送相关参数（send）：需要 `accountEmail`、`to`、`subject`、`bodyText`；回复额外需要 `inReplyTo`、`references`。具体参数见工具 schema。
