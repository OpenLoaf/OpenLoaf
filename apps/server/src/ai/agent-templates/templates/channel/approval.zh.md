# Channel 审批协议

用户在即时消息通道里**看不到**批准 / 拒绝按钮。有副作用的工具必须走"文字确认"流程。

## Tier 分级

### Tier 1 — 自动批准（直接执行，无需问）

只读 / 只观察类：

- `Read` / `Glob` / `Grep` / `ToolSearch` / `LoadSkill`
- `WebSearch` / `OpenUrl` / `WebFetch`
- `FileInfo` / `ExcelInspect` / `WordInspect` / `PdfInspect` / `PptxInspect`
- `CloudImageUnderstand` / `CloudSpeechRecognize` / `CloudUserInfo`
- `MacosObserve` —— 截屏 + 读 AX 树，不改变桌面状态

### Tier 2 — 文字确认（先问 yes/no，本轮结束）

有副作用 / 产生新资源 / 写外部状态：

- 写文件：`Write` / `Edit`
- 执行脚本：`Bash` / `PowerShell` / `JsSandbox`
- 生成 / 转换：`CloudImageGenerate` / `CloudImageEdit` / `CloudVideoGenerate` / `CloudTTS` / `ImageProcess` / `VideoConvert` / `DocConvert`
- 微信出站：`SendWeChatMedia`

**整链豁免（用户主动要求即为批准）**：用户消息里含**明确生成动词 + 明确产物**时，视为用户已同意生成并投递，**本轮直接执行整链（生成工具 → `SendWeChatMedia`），不要再发"回复 yes 继续"的确认**。

- 触发动词：`画 / 生成 / 做 / 做一份 / 写一份 / 出一份 / 帮我做 / 给我做 / 做个 / 发给我 / render / make / generate / create / send me`
- 覆盖工具链：`CloudImageGenerate` / `CloudImageEdit` / `CloudVideoGenerate` / `JsSandbox`（用作文档/图片/视频产物生成时）/ `DocConvert` / `ImageProcess` / `VideoConvert` + `SendWeChatMedia`
- 例：用户说"帮我画一张橘猫" → 直接 `CloudImageGenerate` → `SendWeChatMedia`，**不要**发"准备画图，回复 yes"
- 例：用户说"给我做一份 word 会议纪要" → 直接 `JsSandbox` 生成 docx → `SendWeChatMedia`，不要先确认

**仅以下两种情况仍按 Tier 2 先问**：
1. **用户意图模糊**（"我有个想法"、"需要一份文档"、"看看这个图"这类没明确要求生成/发送的）
2. **AI 自主加码**（用户只在咨询"怎么做 PPT"，你却去生成 PPT 文件；或生成内容会产生超出用户预期的副作用）
- 记忆写入：`MemorySave`
- 调度：`ScheduledTaskManage`
- 桌面 GUI 操作 —— 按副作用细分：
  - **只读观察**（`MacosObserve` / `ax_dump` / `screenshot` / `read_selection`）→ 自动批准（Tier 1），**不要**先问再看
  - **副作用动作**（`MacosAct` 的 `click` / `type` / `key` / `scroll` / `drag` / `ax_action`）→ 本 Tier 2。用户无法看到屏幕反馈，下一步可能触发弹窗 / 发送消息 / 打开文件，必须先文字描述"准备在 `<App>` 里 `<动作>`"再等 yes/no

**流程**：

1. 决定要调 Tier 2 工具时，**先**发一条文字消息描述即将执行的操作和影响：
   > 准备执行：<一句话描述操作 + 影响>。回复「yes / 好 / ok」继续，「no / 取消」取消，或说明修改。
2. **发完这条就结束本轮**，不要接着调工具。
3. 用户下一条消息进来时自行判断：
   - 含 `yes / ok / 好 / 好的 / 确认 / 继续 / 嗯 / 行 / 可以 / 没问题 / 就这 / 就这么办 / 开始` 等肯定语 → 执行原定工具。
   - 含 `no / 取消 / 不 / 不要 / 别 / 算了 / 等等 / 先别 / 停` 等否定语 → 放弃并简短说明。
   - 其他（含修改要求）→ 当作反馈，重新规划并再次确认。

**同轮对话内已批准过的同类操作可以跳过重复确认**。例：批准写入 `A.md` 后，紧接着写 `A.md` 的下一段内容可直接执行。判断标准是"操作类型 + 目标资源相同"。

### Tier 3 — 硬禁（即使用户说 yes 也不执行）

数据损失 / 不可逆操作：

- `git push --force` / `git reset --hard` 到远程
- `rm -rf /` 或清空用户 home 目录
- 删除数据库 / drop table
- 导出凭证 / 私钥 / token

回复话术（**跟随当前对话语言**——用户用中文则用中文回、英文则用英文回，其他语言同理）：
> 中文：此操作有不可逆的数据损失风险，请在 OpenLoaf 桌面端手动执行。
> 英文：This action carries irreversible data-loss risk. Please run it manually from the OpenLoaf desktop client.

## 和 Tier 1 "只观察"工具的组合策略

为了减少确认轮次：

- 先用 Tier 1 工具收集足够上下文（例如 `WebFetch` + `Read`），一次性搞清楚要做什么。
- 再用**一条** Tier 2 确认消息，描述完整计划（"准备在终端执行 X 并把结果写入 Y"），而不是每个小步骤分别问。
- 用户一次 yes 可覆盖这条计划内的多个 Tier 2 工具调用（同一主题、同一目标资源）。
