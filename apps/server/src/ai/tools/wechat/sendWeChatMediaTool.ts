/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * SendWeChatMedia — channel-scope tool that queues an image/video/file for
 * delivery via the WeChat channel. The tool intentionally does **not** invoke
 * the iLink send* API directly; it pushes a pending action onto the in-flight
 * race's outbound queue (see `wechatAiBridge.ts` `enqueueChannelOutbound`).
 * The race coordinator drains the queue after the winning agent's text is
 * ready, so a race that gets aborted (new inbound mid-flight) naturally drops
 * any pending media — same orphan-discard semantics as aborted text replies.
 *
 * Voice kind is deliberately unsupported: the `wechat-ilink-client` SDK has
 * no sendVoice / uploadVoice export, so the tool returns `voice_send_unsupported`
 * immediately rather than silently succeeding then failing downstream.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { sendWeChatMediaToolDef } from '@openloaf/api/types/tools/wechat'
import {
  ATTACHMENT_TAG_REGEX,
  parseAttachmentTagAttrs,
  type AttachmentTagAttrs,
} from '@openloaf/api/common/attachmentTag'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { sendChannelMediaNow } from '@/services/wechat/wechatAiBridge'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { logger } from '@/common/logger'

type SendMediaKind = 'image' | 'video' | 'file' | 'voice'

interface SendMediaInput {
  kind: SendMediaKind
  source: string
  fileName?: string
  caption?: string
}

interface SendMediaOk {
  ok: true
  kind: Exclude<SendMediaKind, 'voice'>
  messageId: string
}

interface SendMediaErr {
  ok: false
  code:
    | 'voice_send_unsupported'
    | 'no_session'
    | 'no_account'
    | 'no_context_token'
    | 'invalid_source'
    | 'send_failed'
  error: string
}

export const sendWeChatMediaTool = tool({
  description: sendWeChatMediaToolDef.description,
  inputSchema: zodSchema(sendWeChatMediaToolDef.parameters),
  execute: async (raw): Promise<SendMediaOk | SendMediaErr> => {
    const input = raw as SendMediaInput

    if (input.kind === 'voice') {
      return {
        ok: false,
        code: 'voice_send_unsupported',
        error:
          '微信 iLink 协议暂不支持发送语音气泡，请用文字回复，或把 TTS 产物作为 file 发出。',
      }
    }

    const sessionId = getSessionId()
    if (!sessionId) {
      return {
        ok: false,
        code: 'no_session',
        error: 'SendWeChatMedia 必须在 channel agent 上下文里调用（拿不到 sessionId）。',
      }
    }

    let localPath: string
    try {
      localPath = await resolveMediaSourceToLocalPath({
        sessionId,
        source: input.source,
      })
    } catch (err) {
      return {
        ok: false,
        code: 'invalid_source',
        error: `无法把 source 解析为本地文件：${String(err)}`,
      }
    }

    // File existence check before enqueueing — catches "Cloud tool returned
    // but wrote to a different path" bugs early rather than at flush time.
    try {
      await fs.access(localPath)
    } catch {
      return {
        ok: false,
        code: 'invalid_source',
        error: `localPath 不存在：${localPath}`,
      }
    }

    const fileName = input.fileName ?? path.basename(localPath)
    const sendResult = await sendChannelMediaNow(sessionId, {
      kind: input.kind,
      localPath,
      fileName: input.kind === 'file' ? fileName : input.fileName,
      caption: input.caption,
    })

    if (!sendResult.ok) {
      logger.warn(
        { sessionId, kind: input.kind, code: sendResult.code, error: sendResult.error },
        '[send-wechat-media] failed',
      )
      return {
        ok: false,
        code: sendResult.code,
        error: sendResult.error,
      }
    }

    logger.info(
      { sessionId, kind: input.kind, fileName, messageId: sendResult.messageId },
      '[send-wechat-media] sent',
    )
    return {
      ok: true,
      kind: input.kind,
      messageId: sendResult.messageId,
    }
  },
})

/**
 * Accept three source shapes and return an absolute local file path ready for
 * `AccountApiClient.sendImage/Video/File`:
 *   1. Absolute local path — used as-is.
 *   2. `<system-tag type="attachment" path="..." />` — extract `path`.
 *   3. `https://` CDN URL — download to `<sessionAsset>/out-<ts>.<ext>`.
 *
 * Attachment path may contain the `${CURRENT_CHAT_DIR}` placeholder (that's how
 * persistMediaItem writes them); expand it to the real session asset dir.
 */
async function resolveMediaSourceToLocalPath(input: {
  sessionId: string
  source: string
}): Promise<string> {
  const { sessionId, source } = input
  const trimmed = source.trim()

  // attachment tag form — extract attrs via the shared regex and reuse
  // parseAttachmentTagAttrs (which takes only the inner attribute string).
  if (trimmed.startsWith('<') && trimmed.includes('type="attachment"')) {
    ATTACHMENT_TAG_REGEX.lastIndex = 0
    const match = ATTACHMENT_TAG_REGEX.exec(trimmed)
    ATTACHMENT_TAG_REGEX.lastIndex = 0
    if (!match) throw new Error('source 看起来像 attachment tag 但格式不匹配')
    const attrs = parseAttachmentTagAttrs(match[1] ?? '') as AttachmentTagAttrs | null
    if (!attrs?.path) throw new Error('attachment tag 缺少 path 属性')
    return expandSessionPath({ sessionId, raw: attrs.path })
  }

  // https CDN URL form
  if (/^https?:\/\//i.test(trimmed)) {
    return downloadToSessionAsset({ sessionId, url: trimmed })
  }

  // absolute local path
  if (path.isAbsolute(trimmed)) return trimmed

  // relative path with ${CURRENT_CHAT_DIR} placeholder
  return expandSessionPath({ sessionId, raw: trimmed })
}

async function expandSessionPath(input: {
  sessionId: string
  raw: string
}): Promise<string> {
  const { sessionId, raw } = input
  const assetDir = await resolveSessionAssetDir(sessionId)
  // ${CURRENT_CHAT_DIR}/... or CURRENT_CHAT_DIR/...
  const sessionDir = path.dirname(assetDir)
  const normalized = raw
    .replace(/^\$\{CURRENT_CHAT_DIR\}\/?/, '')
    .replace(/^CURRENT_CHAT_DIR\/?/, '')
  return path.isAbsolute(normalized)
    ? normalized
    : path.join(sessionDir, normalized)
}

async function downloadToSessionAsset(input: {
  sessionId: string
  url: string
}): Promise<string> {
  const { sessionId, url } = input
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const assetDir = await resolveSessionAssetDir(sessionId)
  const ext = guessExtFromUrl(url)
  const fileName = `out-${Date.now()}-${Math.random().toString(16).slice(2, 6)}${ext}`
  const abs = path.join(assetDir, fileName)
  await fs.writeFile(abs, buf)
  return abs
}

function guessExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname)
    if (ext && ext.length <= 6) return ext
  } catch { /* fall through */ }
  return '.bin'
}
