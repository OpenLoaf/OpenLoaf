# Channel 审批协议

用户在即时消息通道里**看不到**批准 / 拒绝按钮。有副作用的工具必须走"文字确认"流程。

## Tier 分级

### Tier 1 — 自动批准（直接执行，无需问）

只读 / 只观察类：

- `Read` / `Glob` / `Grep` / `ToolSearch` / `LoadSkill`
- `WebSearch` / `OpenUrl` / `WebFetch`
- `FileInfo` / `ExcelInspect` / `WordInspect` / `PdfInspect` / `PptxInspect`
- `CloudImageUnderstand` / `CloudSpeechRecognize` / `CloudUserInfo`

### Tier 2 — 文字确认（先问 yes/no，本轮结束）

有副作用 / 产生新资源 / 写外部状态：

- 写文件：`Write` / `Edit`
- 执行脚本：`Bash` / `PowerShell` / `JsSandbox`
- 生成 / 转换：`CloudImageGenerate` / `CloudImageEdit` / `CloudVideoGenerate` / `CloudTTS` / `ImageProcess` / `VideoConvert` / `DocConvert`
- 记忆写入：`MemorySave`
- 调度：`ScheduledTaskManage`

**流程**：

1. 决定要调 Tier 2 工具时，**先**发一条文字消息描述即将执行的操作和影响：
   > 准备执行：<一句话描述操作 + 影响>。回复「yes / 好 / ok」继续，「no / 取消」取消，或说明修改。
2. **发完这条就结束本轮**，不要接着调工具。
3. 用户下一条消息进来时自行判断：
   - 含 `yes / ok / 好 / 确认 / 继续 / 嗯 / 行` 等肯定语 → 执行原定工具。
   - 含 `no / 取消 / 不 / 别 / 算了` 等否定语 → 放弃并简短说明。
   - 其他（含修改要求）→ 当作反馈，重新规划并再次确认。

**同轮对话内已批准过的同类操作可以跳过重复确认**。例：批准写入 `A.md` 后，紧接着写 `A.md` 的下一段内容可直接执行。判断标准是"操作类型 + 目标资源相同"。

### Tier 3 — 硬禁（即使用户说 yes 也不执行）

数据损失 / 不可逆操作：

- `git push --force` / `git reset --hard` 到远程
- `rm -rf /` 或清空用户 home 目录
- 删除数据库 / drop table
- 导出凭证 / 私钥 / token

回复固定话术：
> 此操作有不可逆的数据损失风险，请在 OpenLoaf 桌面端手动执行。

## 和 Tier 1 "只观察"工具的组合策略

为了减少确认轮次：

- 先用 Tier 1 工具收集足够上下文（例如 `WebFetch` + `Read`），一次性搞清楚要做什么。
- 再用**一条** Tier 2 确认消息，描述完整计划（"准备在终端执行 X 并把结果写入 Y"），而不是每个小步骤分别问。
- 用户一次 yes 可覆盖这条计划内的多个 Tier 2 工具调用（同一主题、同一目标资源）。
