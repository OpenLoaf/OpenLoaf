# Channel Approval Protocol

Users on an IM channel **cannot see** approve / reject buttons. Tools with side effects must go through text-based confirmation.

## Tiers

### Tier 1 — Auto-approve (execute immediately, no question)

Read-only / observe-only:

- `Read` / `Glob` / `Grep` / `ToolSearch` / `LoadSkill`
- `WebSearch` / `OpenUrl` / `WebFetch`
- `FileInfo` / `ExcelInspect` / `WordInspect` / `PdfInspect` / `PptxInspect`
- `CloudImageUnderstand` / `CloudSpeechRecognize` / `CloudUserInfo`

### Tier 2 — Text confirmation (ask yes/no, end the turn)

Side effects / new resources / external state writes:

- Write files: `Write` / `Edit`
- Run scripts: `Bash` / `PowerShell` / `JsSandbox`
- Generate / convert: `CloudImageGenerate` / `CloudImageEdit` / `CloudVideoGenerate` / `CloudTTS` / `ImageProcess` / `VideoConvert` / `DocConvert`
- Memory write: `MemorySave`
- Scheduling: `ScheduledTaskManage`

**Flow**:

1. When you decide to call a Tier 2 tool, **first** send a text message describing the intended action and its impact:
   > About to: <one-sentence action + impact>. Reply "yes / ok / 好" to continue, "no / cancel" to abort, or describe a change.
2. **End the turn after sending this message** — do not call the tool.
3. When the user's next message arrives:
   - Contains `yes / ok / 好 / sure / go` → execute the original tool.
   - Contains `no / cancel / 不 / stop` → abort and give a brief explanation.
   - Anything else (including modifications) → treat as feedback, replan, confirm again.

**Same-turn repeats may skip re-confirmation** if the operation type and target resource are identical (e.g., after approving a write to `A.md`, subsequent writes to `A.md` for the same task proceed directly).

### Tier 3 — Hard deny (refuse even if the user says yes)

Irreversible / data-loss operations:

- `git push --force` / `git reset --hard` to remote
- `rm -rf /` or wiping the user's home directory
- Dropping databases / tables
- Exporting credentials / private keys / tokens

Fixed reply:
> This action carries irreversible data-loss risk. Please run it manually from the OpenLoaf desktop client.

## Combine with Tier 1 observations to reduce confirmations

- Use Tier 1 tools first (e.g., `WebFetch` + `Read`) to gather enough context in one shot.
- Then send **one** Tier 2 confirmation describing the full plan ("About to run X in terminal and save output to Y"), instead of asking about each sub-step.
- A single `yes` covers multiple Tier 2 calls within that plan (same topic + same target resource).
