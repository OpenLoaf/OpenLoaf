import { z } from "zod";

// ==========
// Browser Runtime 协议（MVP）
// - 目标：让 server 通过统一协议调度 Electron/Headless runtime 执行浏览器动作
// - 约定：协议字段尽量稳定，业务侧不要手写字符串（优先引用 schema/type）
// ==========

export const runtimeTypeSchema = z.enum(["electron", "headless"]);
export type RuntimeType = z.infer<typeof runtimeTypeSchema>;

/**
 * runtime 能力声明（MVP：先留扩展位）。
 * 注意：capabilities 允许透传未知字段，便于逐步演进。
 */
export const runtimeCapabilitiesSchema = z
  .object({
    openPage: z.boolean().optional(),
  })
  .passthrough();
export type RuntimeCapabilities = z.infer<typeof runtimeCapabilitiesSchema>;

/**
 * runtime 首次连接时的 hello 消息。
 * - Electron runtime 必须提供 `electronClientId`
 * - Headless runtime 使用 `instanceId` 标识进程/实例即可
 */
export const runtimeHelloSchema = z.object({
  type: z.literal("hello"),
  runtimeType: runtimeTypeSchema,
  instanceId: z.string().min(1),
  electronClientId: z.string().min(1).optional(),
  capabilities: runtimeCapabilitiesSchema.default({}),
  auth: z
    .object({
      token: z.string().min(1).optional(),
    })
    .optional(),
});
export type RuntimeHello = z.infer<typeof runtimeHelloSchema>;

export const runtimeHelloAckSchema = z.object({
  type: z.literal("helloAck"),
  ok: z.boolean(),
  serverTime: z.number().int(),
  error: z.string().optional(),
});
export type RuntimeHelloAck = z.infer<typeof runtimeHelloAckSchema>;

// ==========
// Server -> Runtime：命令
// ==========

export const runtimeOpenPageCommandSchema = z.object({
  kind: z.literal("openPage"),
  requestId: z.string().min(1),
  pageTargetId: z.string().min(1),
  url: z.string().min(1),
  tabId: z.string().min(1),
  title: z.string().optional(),
});
export type RuntimeOpenPageCommand = z.infer<typeof runtimeOpenPageCommandSchema>;

export const runtimeCommandSchema = z.discriminatedUnion("kind", [
  runtimeOpenPageCommandSchema,
]);
export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;

export const runtimeServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("command"),
    command: runtimeCommandSchema,
  }),
  runtimeHelloAckSchema,
]);
export type RuntimeServerMessage = z.infer<typeof runtimeServerMessageSchema>;

// ==========
// Runtime -> Server：回执
// ==========

export const runtimeOpenPageResultSchema = z.object({
  pageTargetId: z.string().min(1),
  backend: z.enum(["electron", "headless"]),
  cdpTargetId: z.string().min(1).optional(),
  webContentsId: z.number().int().optional(),
});
export type RuntimeOpenPageResult = z.infer<typeof runtimeOpenPageResultSchema>;

export const runtimeAckSchema = z.object({
  type: z.literal("ack"),
  requestId: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type RuntimeAck = z.infer<typeof runtimeAckSchema>;

export const runtimeClientMessageSchema = z.discriminatedUnion("type", [
  runtimeHelloSchema,
  runtimeAckSchema,
]);
export type RuntimeClientMessage = z.infer<typeof runtimeClientMessageSchema>;

