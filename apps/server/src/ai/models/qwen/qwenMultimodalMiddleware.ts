/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { randomUUID } from "node:crypto";
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";

// 背景：
//   @ai-sdk/alibaba 与 @ai-sdk/openai 的 chat messages 转换器，只把 mediaType
//   为 image/* 的 file part 映射到 OpenAI 兼容的 image_url，遇到 video/* /
//   application/pdf 之外的 audio/* 都直接抛 UnsupportedFunctionalityError。
//   但 Qwen / 阿里百炼的 OpenAI-Compatible /chat/completions 其实支持
//   video_url / input_audio 两种 type（详见百炼文档）。
//
// 实现：
//   1. transformParams：把 user message 里 mediaType 为 video/* 或 audio/* 的
//      file part 原地换成 type=text、text=占位符（__OL_MEDIA_PART__<uuid>__），
//      把原始 { url / base64 / mediaType } 暂存到进程内 Map。
//   2. 自定义 fetch（wrapQwenMultimodalFetch）：在 HTTP body 发出前扫描 body
//      里的占位符，把 { "type":"text","text":"__OL_MEDIA_PART__<uuid>__" } 对象
//      整体替换成 { "type":"video_url","video_url":{"url":"..."} } 或
//      { "type":"input_audio","input_audio":{"data":"...","format":"..."} }。
//   3. 无论匹配成功与否，**使用后立刻从 Map 中删除**；同时定期清理过期条目，
//      防止并发请求串扰或内存泄漏。
//
// 适用范围：
//   - qwen / dashscope / alibaba provider 的直连和 SaaS 路径（见 providerAdapters）。
//   - 其他 provider 不要使用，因为 video_url / input_audio 不是通用 OpenAI 格式。

type PendingMediaPart =
  | {
      kind: "video";
      /** Must be https URL (Qwen video_url 只接受 URL，不接受 base64)。 */
      url: string;
      mediaType: string;
      createdAt: number;
    }
  | {
      kind: "audio";
      /** base64 编码的音频数据（不含 data: 前缀）。 */
      base64: string;
      format: "wav" | "mp3";
      mediaType: string;
      createdAt: number;
    };

const PENDING: Map<string, PendingMediaPart> = new Map();
const TTL_MS = 5 * 60 * 1000;
const PLACEHOLDER_PREFIX = "__OL_MEDIA_PART__";

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, part] of PENDING) {
    if (now - part.createdAt > TTL_MS) PENDING.delete(id);
  }
}

function makePlaceholder(id: string): string {
  return `${PLACEHOLDER_PREFIX}${id}__`;
}

/** 把任意 data 归一化成可作为 video_url.url 传给 Qwen 的字符串。 */
function normalizeVideoUrl(data: unknown): string | null {
  if (data instanceof URL) return data.toString();
  if (typeof data === "string") {
    if (data.startsWith("http://") || data.startsWith("https://")) return data;
    // data URL 理论上 Qwen 不接受；返回 null 让流程保持原 file part。
  }
  return null;
}

function detectAudioFormat(mediaType: string): "wav" | "mp3" | null {
  const t = mediaType.toLowerCase();
  if (t === "audio/wav" || t === "audio/x-wav") return "wav";
  if (t === "audio/mp3" || t === "audio/mpeg") return "mp3";
  return null;
}

function toBase64(data: unknown): string | null {
  if (typeof data === "string") {
    const m = data.match(/^data:[^;]+;base64,(.*)$/);
    if (m) return m[1]!;
    // 直接把纯 base64 字符串透传。
    return data;
  }
  if (data instanceof Uint8Array) return Buffer.from(data).toString("base64");
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString("base64");
  return null;
}

/** Language model middleware that parks video/audio file parts behind text placeholders. */
export function createQwenMultimodalMiddleware(): LanguageModelV3Middleware {
  return {
    specificationVersion: "v3",
    // 告诉 AI SDK 对 video_*/audio_* 的 https URL 不要下载——否则 data 会被
    // 替换成 Uint8Array，我们就拿不到原始 URL 给 video_url 使用了。
    overrideSupportedUrls: () => ({
      "video/*": [/^https?:\/\//i],
      "audio/*": [/^https?:\/\//i],
    }),
    transformParams: async ({ params }) => {
      sweepExpired();
      const prompt = params.prompt;
      if (!Array.isArray(prompt)) return params;
      const nextPrompt = prompt.map((msg) => {
        if (msg.role !== "user") return msg;
        const content = Array.isArray(msg.content) ? msg.content : [];
        let touched = false;
        const nextContent = content.map((part: any) => {
          if (!part || part.type !== "file" || typeof part.mediaType !== "string") return part;
          const mediaType = part.mediaType as string;
          if (mediaType.startsWith("video/")) {
            const url = normalizeVideoUrl(part.data);
            if (!url) return part; // 让 SDK 按原逻辑处理；调用方应已 strip
            const id = randomUUID();
            PENDING.set(id, { kind: "video", url, mediaType, createdAt: Date.now() });
            touched = true;
            return { type: "text", text: makePlaceholder(id) };
          }
          if (mediaType.startsWith("audio/")) {
            const format = detectAudioFormat(mediaType);
            const base64 = toBase64(part.data);
            if (!format || !base64) return part;
            const id = randomUUID();
            PENDING.set(id, {
              kind: "audio",
              base64,
              format,
              mediaType,
              createdAt: Date.now(),
            });
            touched = true;
            return { type: "text", text: makePlaceholder(id) };
          }
          return part;
        });
        return touched ? { ...msg, content: nextContent } : msg;
      });
      return { ...params, prompt: nextPrompt };
    },
  };
}

const PLACEHOLDER_TEXT_RE = new RegExp(`^${PLACEHOLDER_PREFIX}([0-9a-f-]{36})__$`);

function buildPartForId(id: string): Record<string, unknown> | null {
  const part = PENDING.get(id);
  if (!part) return null;
  PENDING.delete(id);
  if (part.kind === "video") {
    return { type: "video_url", video_url: { url: part.url } };
  }
  return {
    type: "input_audio",
    input_audio: { data: part.base64, format: part.format },
  };
}

/** Replace placeholders in an outgoing HTTP JSON body with video_url/input_audio parts. */
function substitutePlaceholders(bodyStr: string): string {
  // 快速路径：body 里没有占位符前缀直接返回。
  if (!bodyStr.includes(PLACEHOLDER_PREFIX)) return bodyStr;
  let body: any;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    return bodyStr;
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return bodyStr;
  let touched = false;
  for (const msg of body.messages) {
    if (!msg || typeof msg !== "object" || !Array.isArray(msg.content)) continue;
    msg.content = msg.content.map((part: any) => {
      if (!part || typeof part !== "object") return part;
      if (part.type !== "text" || typeof part.text !== "string") return part;
      const m = part.text.match(PLACEHOLDER_TEXT_RE);
      if (!m) return part;
      const replacement = buildPartForId(m[1]!);
      if (!replacement) return part;
      touched = true;
      return replacement;
    });
  }
  return touched ? JSON.stringify(body) : bodyStr;
}

/**
 * Wrap an existing fetch so that outgoing request bodies get media placeholders
 * substituted right before the HTTP call. Order: this wrapper should be the
 * innermost layer around the real HTTP fetch, so composed debug/logging wrappers
 * see the already-substituted body.
 */
export function wrapQwenMultimodalFetch(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (init?.body && typeof init.body === "string" && init.body.includes(PLACEHOLDER_PREFIX)) {
      init = { ...init, body: substitutePlaceholders(init.body) };
    }
    return inner(input, init);
  };
}
