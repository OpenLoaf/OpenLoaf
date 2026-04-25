/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export const sendWeChatMediaToolDef = {
  id: "SendWeChatMedia",
  readonly: false,
  name: "Send WeChat Media",
  description: `在 WeChat channel 会话里把一个媒体文件（图片 / 视频 / 文件）作为独立气泡发给用户。WeChat 协议里图/视频/文件**不能和文字同气泡**，所以调用此工具**不会**附带普通的 sendText 消息。

用法：
- 调用前你必须已经有一个**本地文件路径**。典型流程：先 \`CloudImageGenerate\`（或 \`CloudVideoGenerate\` / \`DocConvert\` / \`JsSandbox\` 等生成类工具）拿到 \`localPath\`，再立刻用 \`SendWeChatMedia\` 把该路径发出去。没有这一步，用户手机上看不到任何东西。
- \`kind\`：image | video | file。**不支持 voice**（iLink 协议没有 sendVoice 接口）；用户要"用语音回我"时礼貌说明即可，不要调这个工具的 voice 分支白白耗积分。
- \`source\`：
  * 本地绝对路径（最常见，和 Cloud 工具返回的 \`localPath\` 对齐）
  * \`<system-tag type="attachment" path="..." />\` 格式的 attachment tag 字符串
  * https:// 开头的 SaaS CDN URL（工具会先下载再发，注意延迟）
- \`fileName\`：\`kind='file'\` 时必填，用户微信里看到的文件气泡显示名（示例 "会议纪要.docx"）。
- \`caption\`：**短**说明（≤30 字），可选。不想重复文字就别填；留空不影响发送。

返回 \`{ ok: true, kind, messageId }\` 或 \`{ ok: false, code, error }\`。\`code\` 值：
- \`voice_send_unsupported\` — kind='voice' 被显式拒绝
- \`no_active_race\` — 工具被非 WeChat channel 场景的 agent 调了
- \`invalid_source\` — source 解析失败
- \`send_failed\` — iLink 上传或 send* 抛错

发完媒体后，如果你想说的文字琐碎（"给你"、"这是画好的图"），**不要**再输出 sendText 文字——媒体气泡本身就够了；identity.md rule 8 对此有明确约束。`,
  parameters: z.object({
    kind: z
      .enum(["image", "video", "file", "voice"])
      .describe(
        'image / video / file 可发；voice 当前不支持（iLink SDK 限制），调用会返回 voice_send_unsupported。',
      ),
    source: z
      .string()
      .min(1)
      .describe(
        "媒体来源：本地绝对路径 | <system-tag type=\"attachment\" path=\"...\"/> | https:// SaaS CDN URL。",
      ),
    fileName: z
      .string()
      .optional()
      .describe("kind='file' 时必填，用户在微信里看到的文件气泡显示名（例如 \"会议纪要.docx\"）。"),
    caption: z
      .string()
      .optional()
      .describe("可选，简短说明文字（≤30 字），附在媒体气泡旁；不想重复说就别填。"),
  }),
  component: null,
} as const;
