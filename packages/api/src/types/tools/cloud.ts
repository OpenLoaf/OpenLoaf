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
 * Architecture: progressive discovery — a small set of thin tools the AI
 * dispatches in sequence (Browse → optional Detail → Generate). Variant
 * catalogs are fetched at runtime via Browse/Detail rather than baked into
 * tool schemas or skills, keeping the permanent prompt footprint flat even
 * as the cloud capability surface grows.
 *
 * These tools are registered as DEFERRED and activated by LoadSkill/ToolSearch
 * only when the AI loads the cloud-media or cloud-text skill.
 */
import { z } from "zod";

const CATEGORY_ENUM = ["image", "video", "audio", "text", "tools"] as const;

export const cloudCapBrowseToolDef = {
  id: "CloudCapBrowse",
  readonly: true,
  name: "Cloud Capability Browse",
  description: `Discover cloud capabilities (image / video / audio / text / tools). Returns a list of features with their top variants — enough to pick a variant directly in common cases.

- Call this FIRST when the user asks for cloud media/text generation and you don't already know which variant to use.
- Optional \`category\` filter narrows the response. Omit to see everything.
- Response includes each feature's description, top 3 variants (id, name, credits, short tag), and a totalVariants count hint.
- If the top-3 summary isn't enough, call \`CloudCapDetail\` with the chosen variantId for full schema.`,
  parameters: z.object({
    category: z
      .enum(CATEGORY_ENUM)
      .optional()
      .describe("Optional category filter. Omit to list all categories."),
  }),
  component: null,
} as const;

export const cloudCapDetailToolDef = {
  id: "CloudCapDetail",
  readonly: true,
  name: "Cloud Capability Detail",
  description: `Fetch the full schema for one specific cloud variant — required inputs, param definitions, credits per call, and usage constraints.

- Call this AFTER \`CloudCapBrowse\` when the top-3 summary is insufficient (e.g., user asks for an unusual variant or you need exact parameter names).
- You usually don't need this for common cases; Browse's top-variants summary is enough.
- \`variantId\` (required): from CloudCapBrowse, e.g. "OL-IG-003".
- \`featureId\` (recommended): always pass the feature id that owns the variant in your current context (e.g. "imageCaption", "translate"). Some variants like \`OL-TX-006\` are shared across multiple features with different input schemas; omitting featureId can return a 400 "ambiguous" error listing the mountedFeatures — retry with the right one.`,
  parameters: z.object({
    variantId: z
      .string()
      .min(1)
      .describe("Variant identifier from CloudCapBrowse, e.g. OL-IG-003."),
    featureId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Feature id that owns this variant mount (e.g. imageCaption). Required when the variant is shared across multiple features.",
      ),
  }),
  component: null,
} as const;

export const cloudModelGenerateToolDef = {
  id: "CloudModelGenerate",
  readonly: false,
  name: "Cloud Model Generate",
  description: `Submit a cloud media generation (image / video / audio). Blocks until the task completes by default and returns resultUrls.

- Use for image, video, audio generation. For text (translation / OCR text / summarization), use \`CloudTextGenerate\` instead.
- Each call consumes credits from the user's cloud account — check creditsPerCall via Browse/Detail before expensive variants (especially video).
- \`feature\` and \`variant\` identify the capability (e.g., feature="text-to-image", variant="OL-IG-003").
- \`inputs\` carries content (prompt, reference image URLs, audio URLs). Field names come from the variant's input schema.
- \`params\` carries optional controls (aspectRatio, steps, style, ...). Field names come from the variant's param schema.
- Default mode waits for task completion (up to 10 minutes). Set \`waitForCompletion: false\` to return immediately with a taskId for later polling via \`CloudTask\`.`,
  parameters: z.object({
    feature: z
      .string()
      .min(1)
      .describe("Feature id (e.g., 'text-to-image', 'image-to-video')."),
    variant: z
      .string()
      .min(1)
      .describe("Variant id (e.g., 'OL-IG-003')."),
    inputs: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Content inputs keyed by role (e.g., prompt, image, referenceImage)."),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Param options keyed by name (e.g., aspectRatio, steps)."),
    waitForCompletion: z
      .boolean()
      .optional()
      .describe("Default true: block until task completes. Set false to return taskId immediately."),
  }),
  component: null,
} as const;

export const cloudTextGenerateToolDef = {
  id: "CloudTextGenerate",
  readonly: false,
  name: "Cloud Text Generate",
  description: `Invoke a cloud text capability (OCR text, summarization, structured extraction, etc.). Returns the text result synchronously — no task polling.

- Use for text-in / text-out operations. For media (image/video/audio), use \`CloudModelGenerate\`.
- \`feature\` and \`variant\` identify the capability.
- \`inputs\` holds the content (text/url fields as defined by the variant).
- \`params\` holds options (format, language, ...).`,
  parameters: z.object({
    feature: z.string().min(1),
    variant: z.string().min(1),
    inputs: z.record(z.string(), z.unknown()).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  }),
  component: null,
} as const;

export const cloudTaskToolDef = {
  id: "CloudTask",
  readonly: true,
  name: "Cloud Task Status",
  description: `Query the status of a previously submitted cloud generation task.

- Use after calling \`CloudModelGenerate\` with \`waitForCompletion: false\` to poll progress.
- Input: taskId returned by \`CloudModelGenerate\`.
- Response fields: status (queued|running|succeeded|failed|canceled), resultUrls (on success), error (on failure), creditsConsumed.`,
  parameters: z.object({
    taskId: z.string().min(1).describe("Task id returned by CloudModelGenerate."),
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
  description: `Trigger the cloud sign-in dialog in the web UI. Use when the user is not signed in and a downstream cloud tool requires authentication (CloudUserInfo / CloudModelGenerate / CloudTextGenerate / CloudTask / CloudTaskCancel).

- Renders a card in the chat with a "Sign in" button that opens the cloud login dialog.
- If the user is already signed in, returns \`alreadyLoggedIn: true\` and no dialog is opened.
- After the user completes sign-in, you should re-invoke whichever tool originally needed the token.
- No parameters. No credits consumed.`,
  parameters: z.object({}),
  component: null,
} as const;

/**
 * Named cloud tools — flat, semantic entries that replace the progressive-
 * discovery chain (Browse → Detail → Generate) for common scenarios. Each
 * named tool auto-picks an accessible variant and routes through the shared
 * v3 generate pipeline. Advanced users can still fall back to Cloud* tools
 * above when they need a specific variant or uncommon params.
 */

export const cloudImageGenerateToolDef = {
  id: "CloudImageGenerate",
  readonly: false,
  name: "Cloud Image Generate",
  description: `Generate an image from a text prompt using the cloud AI platform. Preferred entry point for "画一张"/"生成图片"/"text to image" — no Browse/Detail needed.

- \`prompt\` (required): natural-language description of the image.
- \`aspectRatio\` (optional): e.g. "1:1", "16:9", "9:16", "4:3". Passed through as a param; backend picks the closest supported value.
- \`style\` (optional): free-form style hint ("watercolor", "pixel art", "photorealistic", …).
- \`referenceImage\` (optional): URL string, \`{ url }\` object, or \`{ path }\` local path — forwarded as an image reference when the chosen variant supports it.
- \`modelHint\` (optional): variant id (e.g. "OL-IG-003") or substring of a variant name to override the default picker. Use when the user explicitly asks for a specific model.
- Internally selects the lowest-credit accessible variant under feature \`imageGenerate\`. Returns the same file-saving result as CloudModelGenerate.`,
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

export const cloudTaskCancelToolDef = {
  id: "CloudTaskCancel",
  readonly: false,
  name: "Cloud Task Cancel",
  description: `Cancel a running cloud generation task.

- Use when a task is still queued/running and the user no longer wants the result (or you need to abort to save credits).
- Input: taskId returned by \`CloudModelGenerate\`.
- Already-completed tasks cannot be canceled; this is a best-effort request.`,
  parameters: z.object({
    taskId: z.string().min(1).describe("Task id to cancel."),
  }),
  component: null,
} as const;
