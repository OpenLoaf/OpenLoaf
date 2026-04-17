/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Cloud v3 capability tool definitions.
 *
 * Architecture: flat, semantic named tools. Each named tool (CloudImageGenerate
 * / CloudImageEdit / CloudVideoGenerate / CloudTTS / CloudSpeechRecognize /
 * CloudImageUnderstand) resolves to a single SaaS feature and auto-picks the
 * cheapest accessible variant from the cached capability snapshot. No
 * progressive Browse/Detail dance — the model calls one named tool and gets a
 * result (or a friendly "no variant available" error).
 *
 * Task management tools (CloudTask / CloudTaskCancel) and auth tools
 * (CloudLogin / CloudUserInfo) remain as thin wrappers around the SaaS SDK.
 *
 * These tools are registered as DEFERRED and activated on demand via
 * LoadSkill / ToolSearch when the cloud-media skill loads.
 */
import { z } from "zod";

export const cloudTaskToolDef = {
  id: "CloudTask",
  readonly: true,
  name: "Cloud Task Status",
  description: `Query the status of a previously submitted cloud generation task.

- Use after a named cloud generate tool (e.g. CloudVideoGenerate) returned \`{ mode: 'timeout', taskId }\` to poll progress.
- Input: taskId returned by the generator tool.
- Response fields: status (queued|running|succeeded|failed|canceled), resultUrls (on success), error (on failure), creditsConsumed.`,
  parameters: z.object({
    taskId: z.string().min(1).describe("Task id returned by a cloud generator tool."),
  }),
  component: null,
} as const;

export const cloudUserInfoToolDef = {
  id: "CloudUserInfo",
  readonly: true,
  name: "Cloud User Info",
  description: `Fetch the currently signed-in cloud user profile — id, email, name, provider, membership level, credits balance, admin flag, and timestamps.

- Use BEFORE invoking expensive variants to verify the user has enough credits / sufficient membership tier.
- Use when the user asks "我的积分还有多少 / 我的会员等级 / 我登录的是哪个账号" or similar profile questions.
- Requires the user to be signed in to the cloud platform. If not signed in, returns an error and you should call \`CloudLogin\` to prompt the user to sign in.
- No parameters. No credits consumed.`,
  parameters: z.object({}),
  component: null,
} as const;

export const cloudLoginToolDef = {
  id: "CloudLogin",
  readonly: false,
  name: "Cloud Login",
  description: `Trigger the cloud sign-in dialog in the web UI. Use when the user is not signed in and a downstream cloud tool requires authentication (CloudUserInfo / CloudImageGenerate / CloudImageEdit / CloudVideoGenerate / CloudTTS / CloudSpeechRecognize / CloudImageUnderstand / CloudTask / CloudTaskCancel).

- Renders a card in the chat with a "Sign in" button that opens the cloud login dialog.
- If the user is already signed in, returns \`alreadyLoggedIn: true\` and no dialog is opened.
- After the user completes sign-in, you should re-invoke whichever tool originally needed the token.
- No parameters. No credits consumed.`,
  parameters: z.object({}),
  component: null,
} as const;

/**
 * Named cloud tools — flat, semantic entries that each resolve to a single
 * SaaS feature. The backend auto-picks an accessible variant from the cached
 * capability snapshot and routes through the shared v3 generate / text pipeline.
 */

export const cloudImageGenerateToolDef = {
  id: "CloudImageGenerate",
  readonly: false,
  name: "Cloud Image Generate",
  description: `Generate an image from a text prompt using the cloud AI platform. Preferred entry point for "画一张"/"生成图片"/"text to image".

**This tool renders the generated image inline in the chat UI automatically.** Once it returns successfully the user already sees the picture — you do NOT need to Read, Open, or otherwise re-display the file. Just reply with one short confirmation line and stop.

- \`prompt\` (required): natural-language description of the image.
- \`aspectRatio\` (optional): e.g. "1:1", "16:9", "9:16", "4:3". Passed through as a param; backend picks the closest supported value.
- \`style\` (optional): free-form style hint ("watercolor", "pixel art", "photorealistic", …).
- \`referenceImage\` (optional): URL string, \`{ url }\` object, or \`{ path }\` local path — forwarded as an image reference when the chosen variant supports it.
- \`modelHint\` (optional): variant id (e.g. "OL-IG-003") or substring of a variant name to override the default picker. Use when the user explicitly asks for a specific model.
- Internally selects the lowest-credit accessible variant under feature \`imageGenerate\`.`,
  parameters: z.object({
    prompt: z.string().min(1).describe("Natural-language image description."),
    aspectRatio: z
      .string()
      .optional()
      .describe("Aspect ratio like '1:1', '16:9'. Optional."),
    style: z
      .string()
      .optional()
      .describe("Free-form style hint. Optional."),
    referenceImage: z
      .unknown()
      .optional()
      .describe("Reference image: URL string, { url }, or { path }. Optional."),
    modelHint: z
      .string()
      .optional()
      .describe("Variant id or name substring to override the default picker. Optional."),
  }),
  component: null,
} as const;

export const cloudImageEditToolDef = {
  id: "CloudImageEdit",
  readonly: false,
  name: "Cloud Image Edit",
  description: `Edit an existing image according to a natural-language instruction ("在猫咪旁边添加一只老鼠"/"把背景换成海边"/"去掉水印"). Preferred entry point for image editing.

**This tool renders the edited image inline in the chat UI automatically.** Once it returns successfully the user already sees the result — you do NOT need to Read, Open, or otherwise re-display the file. Just reply with one short confirmation line and stop.

- \`image\` (required): the source image to edit. Accepts a URL string, \`{ url }\` object, or \`{ path }\` local path (e.g. \`{ path: "\${CURRENT_CHAT_DIR}/cat.png" }\`). Local files auto-upload to CDN.
- \`instruction\` (required): natural-language editing instruction (e.g. "add a mouse next to the cat", "make the sky sunset orange").
- \`mask\` (optional): optional mask image (URL / \`{ url }\` / \`{ path }\`) — white pixels mark the region to edit. Only pass when the chosen variant supports masked edits.
- \`modelHint\` (optional): variant id (e.g. "OL-IE-002") or substring to override the default picker.
- Internally selects the lowest-credit accessible variant under feature \`imageEdit\`.`,
  parameters: z.object({
    image: z
      .unknown()
      .describe("Source image: URL string, { url }, or { path }. Required."),
    instruction: z
      .string()
      .min(1)
      .describe("Natural-language editing instruction."),
    mask: z
      .unknown()
      .optional()
      .describe("Optional mask image: URL, { url }, or { path }. White = edit region."),
    modelHint: z
      .string()
      .optional()
      .describe("Variant id or name substring to override the default picker. Optional."),
  }),
  component: null,
} as const;

export const cloudVideoGenerateToolDef = {
  id: "CloudVideoGenerate",
  readonly: false,
  name: "Cloud Video Generate",
  description: `Generate a short video clip from a prompt plus a first-frame image ("image-to-video"). Preferred entry point for "生视频" / "video generate" / "做个视频".

**This tool renders the generated video inline in the chat UI automatically.** Once it returns successfully the user already sees the clip — you do NOT need to Read, Open, or otherwise re-display the file. Just reply with one short confirmation line and stop.

- \`prompt\` (required): natural-language description of the motion / scene.
- \`startImage\` (**required**): the first-frame image. Accepts URL string, \`{ url }\` object, or \`{ path }\` local path. If the user has no image, generate one first via \`CloudImageGenerate\` and feed its \`filePath\` here.
- \`endImage\` (optional): the last-frame image (same input shape). Only pass when the chosen variant supports two-keyframe interpolation.
- \`duration\` (optional): clip duration in seconds (e.g. 3 / 5 / 10). Backend rounds to the variant's supported values.
- \`modelHint\` (optional): variant id (e.g. "OL-VG-001") or substring to override the default picker.
- Video tasks are slow (minutes to tens of minutes) and expensive (50-500+ credits). The sync wait tops out at 10 minutes; if the task is still running after that the tool returns \`{ mode: 'timeout', taskId }\` — poll with \`CloudTask({ taskId })\` or abort with \`CloudTaskCancel({ taskId })\`.
- Internally selects the lowest-credit accessible variant under feature \`videoGenerate\`.`,
  parameters: z.object({
    prompt: z.string().min(1).describe("Natural-language motion / scene description."),
    startImage: z
      .unknown()
      .describe(
        "First-frame image: URL string, { url }, or { path }. Required (most video variants are image-to-video).",
      ),
    endImage: z
      .unknown()
      .optional()
      .describe("Optional last-frame image: URL, { url }, or { path }."),
    duration: z
      .number()
      .optional()
      .describe("Clip duration in seconds (e.g. 3 / 5 / 10). Optional."),
    modelHint: z
      .string()
      .optional()
      .describe("Variant id or name substring to override the default picker. Optional."),
  }),
  component: null,
} as const;

export const cloudTTSToolDef = {
  id: "CloudTTS",
  readonly: false,
  name: "Cloud Text to Speech",
  description: `Synthesize speech audio from text via the cloud AI platform. Preferred entry point for "配音" / "朗读" / "text to speech" / "语音合成".

**This tool renders the generated audio inline in the chat UI automatically.** Once it returns successfully the user already has a player — you do NOT need to Read, Open, or otherwise re-display the file. Just reply with one short confirmation line and stop.

- \`text\` (required): the text to read aloud.
- \`voice\` (optional): voice id or name. Backend picks a sensible default when omitted.
- \`speed\` (optional): speaking-rate multiplier (e.g. 1.0 default, 0.8 slower, 1.2 faster). Backend clamps to the variant's supported range.
- \`modelHint\` (optional): variant id or substring to override the default picker.
- Internally selects the lowest-credit accessible variant under feature \`tts\`.`,
  parameters: z.object({
    text: z.string().min(1).describe("Text to synthesize into speech."),
    voice: z
      .string()
      .optional()
      .describe("Voice id or name. Optional; backend defaults sensibly."),
    speed: z
      .number()
      .optional()
      .describe("Speaking-rate multiplier, e.g. 1.0 / 0.8 / 1.2. Optional."),
    modelHint: z
      .string()
      .optional()
      .describe("Variant id or name substring to override the default picker. Optional."),
  }),
  component: null,
} as const;

export const cloudSpeechRecognizeToolDef = {
  id: "CloudSpeechRecognize",
  readonly: false,
  name: "Cloud Speech Recognize",
  description: `Transcribe an audio clip to text via the cloud AI platform. Preferred entry point for "语音识别" / "转录" / "speech to text" / "ASR".

Returns the text result directly in the tool output. Use the returned transcript in your reply to the user.

- \`audio\` (required): the audio to transcribe. Accepts URL string, \`{ url }\` object, or \`{ path }\` local path (e.g. \`{ path: "\${CURRENT_CHAT_DIR}/voice.mp3" }\`). Local files auto-upload.
- \`language\` (optional): BCP-47 hint ("zh", "en-US", …) to nudge the recognizer. Backend auto-detects when omitted.
- \`modelHint\` (optional): variant id or substring to override the default picker.
- Internally selects the lowest-credit accessible variant under feature \`speechToText\`.`,
  parameters: z.object({
    audio: z
      .unknown()
      .describe("Audio to transcribe: URL string, { url }, or { path }. Required."),
    language: z
      .string()
      .optional()
      .describe("Language hint like 'zh' / 'en-US'. Optional."),
    modelHint: z
      .string()
      .optional()
      .describe("Variant id or name substring to override the default picker. Optional."),
  }),
  component: null,
} as const;

export const cloudImageUnderstandToolDef = {
  id: "CloudImageUnderstand",
  readonly: false,
  name: "Cloud Image Understand",
  description: `Describe or answer a question about an image using the cloud AI platform — OCR, captioning, visual question answering. Preferred entry point for "识别这张图上的文字" / "看看这张图里有什么" / "OCR" / "VQA".

Returns the text result directly in the tool output. Use the returned answer in your reply to the user.

- \`image\` (required): the image to analyze. Accepts URL string, \`{ url }\` object, or \`{ path }\` local path. Local files auto-upload.
- \`question\` (optional): specific question to ask about the image (e.g. "What color is the car?"). When omitted the model returns a general description / OCR dump depending on the variant.
- \`modelHint\` (optional): variant id or substring to override the default picker.
- Internally selects the lowest-credit accessible variant under feature \`imageCaption\`.`,
  parameters: z.object({
    image: z
      .unknown()
      .describe("Image to analyze: URL string, { url }, or { path }. Required."),
    question: z
      .string()
      .optional()
      .describe("Optional VQA question. Omit for a general description / OCR dump."),
    modelHint: z
      .string()
      .optional()
      .describe("Variant id or name substring to override the default picker. Optional."),
  }),
  component: null,
} as const;

export const cloudTaskCancelToolDef = {
  id: "CloudTaskCancel",
  readonly: false,
  name: "Cloud Task Cancel",
  description: `Cancel a running cloud generation task.

- Use when a task is still queued/running and the user no longer wants the result (or you need to abort to save credits).
- Input: taskId returned by a named cloud generator tool (e.g. CloudVideoGenerate).
- Already-completed tasks cannot be canceled; this is a best-effort request.`,
  parameters: z.object({
    taskId: z.string().min(1).describe("Task id to cancel."),
  }),
  component: null,
} as const;
