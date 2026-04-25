/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * ApiClient factory — returns a real `wechat-ilink-client` ApiClient, or a
 * structurally compatible mock when the account has been registered in
 * `wechatMockStore`. This is the single choke point used by the poll worker
 * and the outbound send service; nothing else should `new ApiClient` directly
 * for account-scoped calls.
 *
 * Binding / QR login still uses the real ApiClient (see `wechatService.ts`)
 * because QR flow isn't covered by the mock layer.
 */

import {
  ApiClient,
  sendText as ilinkSendText,
  sendImage as ilinkSendImage,
  sendVideo as ilinkSendVideo,
  sendFileMessage as ilinkSendFile,
  uploadImage as ilinkUploadImage,
  uploadVideo as ilinkUploadVideo,
  uploadFile as ilinkUploadFile,
  downloadMediaFromItem,
  type GetUpdatesResp,
  type WeixinMessage,
  type MessageItem,
  type DownloadedMedia,
} from 'wechat-ilink-client'
import path from 'node:path'
import type { WeChatAccount } from './wechatAccountStore'
import {
  hasMockAccount,
  drainInbox,
  recordOutbound,
  getMockMode,
  resolveMockMedia,
} from './wechatMockStore'

/** The narrow slice of ApiClient the rest of the code uses. */
export interface AccountApiClient {
  getUpdates(buf: string, timeoutMs?: number): Promise<GetUpdatesResp>
  /** contextToken is required by iLink protocol (echoed from getUpdates). */
  sendText(to: string, text: string, contextToken: string): Promise<string>
  /** Download + decrypt a single media item from an inbound message. */
  downloadMedia(item: MessageItem): Promise<DownloadedMedia | null>
  /**
   * Send an image message from a local file. Internally uploads to the WeChat
   * CDN first, then fires sendImage with the resulting UploadedFileInfo.
   * Throws on failure (same contract as sendText).
   */
  sendImage(to: string, localPath: string, contextToken: string, caption?: string): Promise<string>
  /** Send a video message from a local file (uploads first). Throws on failure. */
  sendVideo(to: string, localPath: string, contextToken: string, caption?: string): Promise<string>
  /** Send a file attachment from a local file (uploads first). Throws on failure. */
  sendFile(
    to: string,
    localPath: string,
    fileName: string,
    contextToken: string,
    caption?: string,
  ): Promise<string>
  /**
   * Fire a "typing" indicator on the WeChat client side. Internally fetches a
   * typing_ticket (via getConfig) then calls sendTyping. Best-effort — returns
   * silently on failure because the visual indicator is cosmetic.
   */
  sendTypingIndicator(to: string, contextToken: string): Promise<void>
}

/**
 * Extract every candidate lookup key from an inbound MessageItem. Mock
 * downloadMedia tries each in order until a registered buffer matches.
 * Order matches the iLink SDK's decryption priority: explicit aes_key wins
 * over nested media.aes_key, then we fall back to encrypt_query_param.
 */
function mockMediaLookupKeys(item: MessageItem): string[] {
  const keys: string[] = []
  const push = (v: unknown): void => {
    if (typeof v === 'string' && v) keys.push(v)
  }
  if (item.image_item) {
    push(item.image_item.aeskey)
    push(item.image_item.media?.aes_key)
    push(item.image_item.media?.encrypt_query_param)
  }
  if (item.voice_item) {
    push(item.voice_item.media?.aes_key)
    push(item.voice_item.media?.encrypt_query_param)
  }
  if (item.video_item) {
    push(item.video_item.media?.aes_key)
    push(item.video_item.media?.encrypt_query_param)
  }
  if (item.file_item) {
    push(item.file_item.media?.aes_key)
    push(item.file_item.media?.encrypt_query_param)
  }
  return keys
}

class RealApiClient implements AccountApiClient {
  private api: ApiClient
  constructor(account: WeChatAccount) {
    this.api = new ApiClient({ baseUrl: account.baseUrl, token: account.botToken })
  }
  getUpdates(buf: string, timeoutMs?: number): Promise<GetUpdatesResp> {
    return this.api.getUpdates(buf, timeoutMs)
  }
  sendText(to: string, text: string, contextToken: string): Promise<string> {
    return ilinkSendText(this.api, to, text, contextToken)
  }
  downloadMedia(item: MessageItem): Promise<DownloadedMedia | null> {
    return downloadMediaFromItem(item, this.api.cdnBaseUrl)
  }
  async sendImage(
    to: string,
    localPath: string,
    contextToken: string,
    caption?: string,
  ): Promise<string> {
    const uploaded = await ilinkUploadImage({
      filePath: localPath,
      toUserId: to,
      api: this.api,
      cdnBaseUrl: this.api.cdnBaseUrl,
    })
    return ilinkSendImage(this.api, to, uploaded, contextToken, caption)
  }
  async sendVideo(
    to: string,
    localPath: string,
    contextToken: string,
    caption?: string,
  ): Promise<string> {
    const uploaded = await ilinkUploadVideo({
      filePath: localPath,
      toUserId: to,
      api: this.api,
      cdnBaseUrl: this.api.cdnBaseUrl,
    })
    return ilinkSendVideo(this.api, to, uploaded, contextToken, caption)
  }
  async sendFile(
    to: string,
    localPath: string,
    fileName: string,
    contextToken: string,
    caption?: string,
  ): Promise<string> {
    const uploaded = await ilinkUploadFile({
      filePath: localPath,
      toUserId: to,
      api: this.api,
      cdnBaseUrl: this.api.cdnBaseUrl,
    })
    return ilinkSendFile(this.api, to, fileName, uploaded, contextToken, caption)
  }
  async sendTypingIndicator(to: string, contextToken: string): Promise<void> {
    // iLink sendTyping 需要 typing_ticket（每次从 getConfig 拿）。拿不到就
    // 静默跳过——typing 指示只是视觉糖，失败不影响主流程。
    // 注：WeChatClient 的 getTypingTicket/sendTyping 高层 API 在低层 ApiClient
    // 上不存在；必须走 getConfig → sendTyping(SendTypingReq) 两步协议。
    try {
      const cfg = await this.api.getConfig(to, contextToken)
      const ticket = cfg?.typing_ticket
      if (!ticket) return
      await this.api.sendTyping({
        ilink_user_id: to,
        typing_ticket: ticket,
        status: 1, // TypingStatus.TYPING = 1
      })
    } catch {
      /* swallow — typing is best-effort */
    }
  }
}

class MockApiClient implements AccountApiClient {
  constructor(private accountId: string) {}

  async getUpdates(buf: string, timeoutMs?: number): Promise<GetUpdatesResp> {
    const msgs = drainInbox(this.accountId)
    if (msgs.length === 0) {
      // Emulate long-poll empty tick — resolve after a short delay so the
      // worker loop doesn't spin tight.
      await new Promise((r) => setTimeout(r, Math.min(timeoutMs ?? 1000, 1000)))
      return { errcode: 0, msgs: [], get_updates_buf: buf }
    }
    return { errcode: 0, msgs, get_updates_buf: buf + '.mock' }
  }

  async sendText(to: string, text: string, contextToken?: string): Promise<string> {
    const mode = getMockMode(this.accountId)
    if (mode === 'sendFails') {
      throw new Error('mock: simulated iLink sendText failure')
    }
    const messageId = `mock-out-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    recordOutbound(this.accountId, {
      to,
      kind: 'text',
      text,
      contextToken,
      at: Date.now(),
      messageId,
    })
    return messageId
  }

  async downloadMedia(item: MessageItem): Promise<DownloadedMedia | null> {
    const keys = mockMediaLookupKeys(item)
    const hit = resolveMockMedia(this.accountId, keys)
    return hit ?? null
  }

  async sendImage(
    to: string,
    localPath: string,
    contextToken: string,
    caption?: string,
  ): Promise<string> {
    return this.recordMediaOutbound({ to, kind: 'image', localPath, contextToken, caption })
  }

  async sendVideo(
    to: string,
    localPath: string,
    contextToken: string,
    caption?: string,
  ): Promise<string> {
    return this.recordMediaOutbound({ to, kind: 'video', localPath, contextToken, caption })
  }

  async sendFile(
    to: string,
    localPath: string,
    fileName: string,
    contextToken: string,
    caption?: string,
  ): Promise<string> {
    return this.recordMediaOutbound({
      to,
      kind: 'file',
      localPath,
      fileName,
      contextToken,
      caption,
    })
  }

  private recordMediaOutbound(input: {
    to: string
    kind: 'image' | 'video' | 'file'
    localPath: string
    fileName?: string
    contextToken: string
    caption?: string
  }): string {
    const mode = getMockMode(this.accountId)
    if (mode === 'sendFails') {
      throw new Error(`mock: simulated iLink send${input.kind[0]!.toUpperCase() + input.kind.slice(1)} failure`)
    }
    const messageId = `mock-out-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    recordOutbound(this.accountId, {
      to: input.to,
      kind: input.kind,
      localPath: input.localPath,
      mediaType: mediaTypeFromLocalPath(input.kind, input.localPath),
      fileName: input.fileName ?? path.basename(input.localPath),
      caption: input.caption,
      contextToken: input.contextToken,
      at: Date.now(),
      messageId,
    })
    return messageId
  }

  async sendTypingIndicator(_to: string, _contextToken: string): Promise<void> {
    // Mock 场景：typing 对 browser test 的断言没影响，直接吞掉即可。
    // 若未来需要验证 "bridge 发了 typing" 可在 mockStore 里加 recordTyping。
    return
  }
}

/** Best-effort MIME type from the outbound local path — only used by mock outbound log. */
function mediaTypeFromLocalPath(kind: 'image' | 'video' | 'file', p: string): string {
  const ext = path.extname(p).toLowerCase()
  if (kind === 'image') {
    if (ext === '.png') return 'image/png'
    if (ext === '.gif') return 'image/gif'
    if (ext === '.webp') return 'image/webp'
    return 'image/jpeg'
  }
  if (kind === 'video') {
    if (ext === '.webm') return 'video/webm'
    if (ext === '.mov') return 'video/quicktime'
    return 'video/mp4'
  }
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (ext === '.txt') return 'text/plain'
  return 'application/octet-stream'
}

export function createAccountApiClient(account: WeChatAccount): AccountApiClient {
  if (hasMockAccount(account.id)) {
    return new MockApiClient(account.id)
  }
  return new RealApiClient(account)
}

export type { WeixinMessage, GetUpdatesResp }
