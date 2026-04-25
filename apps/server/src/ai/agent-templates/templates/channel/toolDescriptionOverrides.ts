/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * Channel-view tool description overrides.
 *
 * Many core tools are written for the OpenLoaf desktop / web client, where
 * the agent can render images / charts / dialogs inline in the chat canvas.
 * When the same agent runs inside a WeChat / Slack / Telegram channel, that
 * rendering simply does not exist — the user only ever sees plain text, media
 * bubbles, or file attachments pushed back via the channel's outbound API.
 *
 * Rather than mutate the source tool definitions (which would confuse the
 * in-app master agent), this module centralises channel-specific guidance as
 * a suffix appended when registering tools inside `createChannelAgent`. The
 * base description stays intact; channels see an extra "[channel note] ..."
 * line that keeps the model from hallucinating behaviours that don't exist
 * on a phone.
 */

/**
 * Channel-specific override mode per tool:
 *   - 'replace': completely replace the base description. Needed when the
 *     base description makes contradictory claims (e.g. CloudImageGenerate
 *     says "renders inline in chat UI automatically" — in WeChat there IS no
 *     inline render, and the model must follow up with SendWeChatMedia).
 *     Appending a note is not enough because qwen flash tends to follow the
 *     stronger/earlier claim. We verified this in run 0328: the model called
 *     CloudImageGenerate but skipped SendWeChatMedia, treating the task as done.
 *   - 'append': keep the base and add a short `[channel note] ...` line.
 *     For tools where the base description is factually OK and we just want
 *     to add a safety caveat (MacosAct, JsSandbox, ...).
 */
type ChannelOverride =
  | { mode: 'replace'; description: string }
  | { mode: 'append'; note: string }

const CHANNEL_OVERRIDES: Record<string, ChannelOverride> = {
  CloudImageGenerate: {
    mode: 'replace',
    description: `Generate an image from a text prompt. Preferred entry for "画一张" / "生成图片" / "text to image". Returns \`{ ok: true, files: [{ filePath, sourceUrl }], ... }\`.

After this tool returns, pass \`files[0].filePath\` as \`source\` to \`SendWeChatMedia({ kind: "image", source })\` — that's how the image gets delivered to the user.`,
  },
  CloudImageEdit: {
    mode: 'replace',
    description: `Edit an image with a text prompt. Returns \`{ ok: true, files: [{ filePath }], ... }\`.

After this tool returns, pass \`files[0].filePath\` to \`SendWeChatMedia({ kind: "image", source })\` to deliver the edited image.`,
  },
  CloudVideoGenerate: {
    mode: 'replace',
    description: `Generate a short video clip. Entry for "生成视频" / "做个 N 秒的视频". Takes \`prompt\` and optional first-frame \`imagePath\`; SaaS round-trip is slow (60-180s). Returns \`{ ok: true, files: [{ filePath, sourceUrl }], ... }\`.

After this tool returns, pass \`files[0].filePath\` as \`source\` to \`SendWeChatMedia({ kind: "video", source })\` to deliver the video to the user.`,
  },
  CloudTTS: {
    mode: 'replace',
    description: `Synthesize speech from text (TTS). Returns a local audio file path.

In the WeChat channel, voice bubbles are not available (iLink SDK limitation). When the user asks for "用语音回我" / "read it to me", reply in text and skip this tool. Only call CloudTTS if the user specifically wants an audio **file**; in that case deliver it via \`SendWeChatMedia({ kind: "file", source: <filePath>, fileName: "<name>.mp3" })\`.`,
  },
  JsSandbox: {
    mode: 'replace',
    description: `Run a Node.js script in a sandbox. Useful for producing files (docx/pdf/xlsx/pptx/images/zip) and emitting stdout. Returns the process output + any files written to \`$CURRENT_CHAT_DIR\`.

If the script produces a file the user should receive (e.g. a Word document they asked for), pass the generated filePath to \`SendWeChatMedia({ kind: "file", source, fileName })\` as the next step so the file gets delivered as a WeChat attachment bubble.`,
  },
  CloudLogin: {
    mode: 'append',
    note: '微信通道场景：这里没有登录对话框。如果判定需要用户登录 OpenLoaf 云端，直接用 sendText 回复"请在 OpenLoaf 客户端完成登录后再找我"即可，不要真调这个工具。',
  },
  MacosObserve: {
    mode: 'append',
    note: '微信通道场景：你观察到的桌面是**服务器侧**（OpenLoaf 运行的 macOS），**不是**用户的手机屏幕。用户要求远程控制时，说明这一点再继续。',
  },
  MacosAct: {
    mode: 'append',
    note: '微信通道场景：你操作的是**服务器侧**桌面。关键操作（删除 / 发送 / 下单等）执行前，用 sendText 简述将要做什么并等待用户一句"可以/好/ok"再继续。',
}
}

/**
 * Compute the channel-override description for a tool. Returns undefined when
 * the tool has no channel-specific handling (most tools need no change).
 *
 * Caller contract: if this returns a string, replace the tool's description
 * with the returned value when registering inside `createChannelAgent`.
 */
export function overrideChannelToolDescription(
  toolId: string,
  base: string | undefined,
): string | undefined {
  const override = CHANNEL_OVERRIDES[toolId]
  if (!override) return undefined
  if (override.mode === 'replace') return override.description
  const baseText = typeof base === 'string' ? base.trimEnd() : ''
  return baseText
    ? `${baseText}\n\n[channel note] ${override.note}`
    : `[channel note] ${override.note}`
}

/** True when the tool id has a channel-specific caveat or replacement registered. */
export function hasChannelToolOverride(toolId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHANNEL_OVERRIDES, toolId)
}

/**
 * Per-tool next-step hint appended to the tool's OUTPUT (not description) when
 * the tool has succeeded inside the channel agent. Description-level coaching
 * has proven insufficient with qwen flash — the model sees `ok: true, files:
 * [...]` and treats the task as done. Appending an explicit "next step" to
 * the tool's own result text (which the model reads on its next turn) is a
 * much stronger signal: it enters the model's working context at exactly the
 * point where it's deciding what to do next.
 *
 * Returns undefined when the tool has no next-step chain. Callers wrap the
 * tool's `execute` and append this hint to string outputs only when the
 * result parses as `{ ok: true, ... }`.
 */
const CHANNEL_NEXT_STEP_HINTS: Record<string, string> = {
  CloudImageGenerate:
    '\n\n[channel hint] 成功。**下一步**：取上面的 files[0].filePath，立即调用 SendWeChatMedia({ kind: "image", source: <filePath> })。不调用这一步，用户手机上看不到图片。',
  CloudImageEdit:
    '\n\n[channel hint] 成功。**下一步**：取上面的 files[0].filePath，立即调用 SendWeChatMedia({ kind: "image", source: <filePath> })。不调用这一步，用户手机上看不到图片。',
  CloudVideoGenerate:
    '\n\n[channel hint] 成功。**下一步**：取上面的 files[0].filePath，立即调用 SendWeChatMedia({ kind: "video", source: <filePath> })。不调用这一步，用户手机上看不到视频。',
  JsSandbox:
    '\n\n[channel hint] 如果脚本生成了用户要求的文件（docx/pdf/xlsx/pptx/图片等），**下一步**立即调用 SendWeChatMedia({ kind: "file", source: <生成的文件路径>, fileName: "<文件名>" })。不调用这一步，用户手机上看不到文件。stdout 的文本摘要可以正常作为 sendText 回复。',
}

/**
 * Append the channel-specific "next step" hint to a successful tool output.
 * Called by `createChannelAgent` for each wrapped tool; returns the original
 * string unchanged when the tool has no hint or when the result doesn't look
 * like a successful JSON payload.
 */
export function appendChannelNextStepHint(toolId: string, output: string): string {
  const hint = CHANNEL_NEXT_STEP_HINTS[toolId]
  if (!hint) return output
  if (typeof output !== 'string' || output.length === 0) return output
  // Only attach to ok results — no point nagging after a failure.
  // Cloud tools return a JSON string; look for the `"ok": true` marker.
  if (!/"ok"\s*:\s*true/.test(output)) return output
  return `${output}${hint}`
}
