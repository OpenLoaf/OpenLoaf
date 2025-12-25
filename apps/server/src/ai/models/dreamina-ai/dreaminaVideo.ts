import { callDreaminaApi, normalizeReqJson } from "./dreaminaClient";
import { DREAMINA_REQ_KEYS, getDreaminaConfig } from "./dreaminaConfig";

type DreaminaVideoSubmitInput = {
  /** 提示词 */
  prompt?: string;
  /** 参考图 URL 列表（首帧） */
  imageUrls?: string[];
  /** 图片 base64 列表（首帧） */
  binaryDataBase64?: string[];
  /** 随机种子 */
  seed?: number;
  /** 总帧数 */
  frames?: number;
  /** 视频比例 */
  aspectRatio?: string;
  /** 取消信号 */
  abortSignal?: AbortSignal;
};

type DreaminaVideoSubmitResult = {
  /** 任务 ID */
  taskId: string;
};

type DreaminaVideoResultInput = {
  /** 任务 ID */
  taskId: string;
  /** 透传扩展参数 */
  reqJson?: string | Record<string, unknown>;
  /** 取消信号 */
  abortSignal?: AbortSignal;
};

type DreaminaVideoResult = {
  /** 任务状态 */
  status: string;
  /** 视频地址 */
  videoUrl?: string | null;
  /** 隐式标识打标状态 */
  aigcMetaTagged?: boolean;
};

/** Submit a Dreamina video task and return the task id. */
export async function submitDreaminaVideoTask(
  input: DreaminaVideoSubmitInput,
): Promise<DreaminaVideoSubmitResult> {
  // 中文注释：文生视频必须有 prompt，图生视频必须有首帧图。
  if (!input.prompt && !input.imageUrls?.length && !input.binaryDataBase64?.length) {
    throw new Error("视频生成需要 prompt 或首帧图片");
  }
  const config = await getDreaminaConfig();
  const data = await callDreaminaApi<{ task_id?: string }>(
    config,
    "CVSync2AsyncSubmitTask",
    {
      req_key: DREAMINA_REQ_KEYS.video,
      prompt: input.prompt,
      image_urls: input.imageUrls,
      binary_data_base64: input.binaryDataBase64,
      seed: input.seed,
      frames: input.frames,
      aspect_ratio: input.aspectRatio,
    },
    input.abortSignal,
  );
  const taskId = data?.task_id?.trim();
  if (!taskId) throw new Error("提交任务失败：task_id 为空");
  return { taskId };
}

/** Fetch a Dreamina video task result by task id. */
export async function getDreaminaVideoResult(
  input: DreaminaVideoResultInput,
): Promise<DreaminaVideoResult> {
  const config = await getDreaminaConfig();
  const data = await callDreaminaApi<{
    status?: string;
    video_url?: string | null;
    aigc_meta_tagged?: boolean;
  }>(
    config,
    "CVSync2AsyncGetResult",
    {
      req_key: DREAMINA_REQ_KEYS.video,
      task_id: input.taskId,
      req_json: normalizeReqJson(input.reqJson),
    },
    input.abortSignal,
  );
  return {
    status: data?.status ?? "unknown",
    videoUrl: data?.video_url ?? null,
    aigcMetaTagged: data?.aigc_meta_tagged ?? false,
  };
}
