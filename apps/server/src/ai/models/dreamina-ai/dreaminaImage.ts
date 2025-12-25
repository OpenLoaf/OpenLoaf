import { callDreaminaApi, normalizeReqJson } from "./dreaminaClient";
import { DREAMINA_REQ_KEYS, getDreaminaConfig } from "./dreaminaConfig";

type DreaminaSubmitResult = {
  /** 任务 ID */
  taskId: string;
};

type DreaminaSubmitInput = {
  /** 提示词 */
  prompt: string;
  /** 参考图 URL 列表 */
  imageUrls?: string[];
  /** 生成面积 */
  size?: number;
  /** 生成宽度 */
  width?: number;
  /** 生成高度 */
  height?: number;
  /** 文本影响强度 */
  scale?: number;
  /** 是否强制单图 */
  forceSingle?: boolean;
  /** 最小宽高比 */
  minRatio?: number;
  /** 最大宽高比 */
  maxRatio?: number;
  /** 随机种子 */
  seed?: number;
  /** 取消信号 */
  abortSignal?: AbortSignal;
};

type DreaminaInpaintInput = {
  /** 参考图 URL 列表（原图+mask） */
  imageUrls?: string[];
  /** 图片 base64 列表（原图+mask） */
  binaryDataBase64?: string[];
  /** 编辑提示词 */
  prompt: string;
  /** 随机种子 */
  seed?: number;
  /** 取消信号 */
  abortSignal?: AbortSignal;
};

type DreaminaMaterialExtractInput = {
  /** 参考图 URL 列表 */
  imageUrls?: string[];
  /** 图片 base64 列表 */
  binaryDataBase64?: string[];
  /** 提取指令 */
  imageEditPrompt: string;
  /** lora 权重 */
  loraWeight?: number;
  /** 输出宽度 */
  width?: number;
  /** 输出高度 */
  height?: number;
  /** 随机种子 */
  seed?: number;
  /** 取消信号 */
  abortSignal?: AbortSignal;
};

type DreaminaGetResultInput = {
  /** 任务 ID */
  taskId: string;
  /** 透传扩展参数 */
  reqJson?: string | Record<string, unknown>;
  /** 取消信号 */
  abortSignal?: AbortSignal;
};

type DreaminaGetResultOutput = {
  /** 任务状态 */
  status: string;
  /** 图片 URL 列表 */
  imageUrls?: string[] | null;
  /** 图片 base64 列表 */
  binaryDataBase64?: string[] | null;
};

/** Submit a Dreamina text-to-image task and return the task id. */
export async function submitDreaminaTask(
  input: DreaminaSubmitInput,
): Promise<DreaminaSubmitResult> {
  return submitTask(
    DREAMINA_REQ_KEYS.t2i,
    {
      image_urls: input.imageUrls,
      prompt: input.prompt,
      size: input.size,
      width: input.width,
      height: input.height,
      scale: input.scale,
      force_single: input.forceSingle,
      min_ratio: input.minRatio,
      max_ratio: input.maxRatio,
      seed: input.seed,
    },
    input.abortSignal,
  );
}

/** Submit a Dreamina inpaint task and return the task id. */
export async function submitDreaminaInpaintTask(
  input: DreaminaInpaintInput,
): Promise<DreaminaSubmitResult> {
  // 中文注释：必须提供原图+mask 两张图，二选一即可。
  if (
    (!input.imageUrls || input.imageUrls.length !== 2) &&
    (!input.binaryDataBase64 || input.binaryDataBase64.length !== 2)
  ) {
    throw new Error("Inpaint 输入需包含 2 张图片（原图+mask）");
  }
  return submitTask(
    DREAMINA_REQ_KEYS.inpaint,
    {
      image_urls: input.imageUrls,
      binary_data_base64: input.binaryDataBase64,
      prompt: input.prompt,
      seed: input.seed,
    },
    input.abortSignal,
  );
}

/** Submit a Dreamina material extraction task and return the task id. */
export async function submitDreaminaMaterialExtractionTask(
  input: DreaminaMaterialExtractInput,
): Promise<DreaminaSubmitResult> {
  // 中文注释：素材提取仅需 1 张图片，二选一即可。
  if (
    (!input.imageUrls || input.imageUrls.length !== 1) &&
    (!input.binaryDataBase64 || input.binaryDataBase64.length !== 1)
  ) {
    throw new Error("素材提取输入需包含 1 张图片");
  }
  return submitTask(
    DREAMINA_REQ_KEYS.material,
    {
      image_urls: input.imageUrls,
      binary_data_base64: input.binaryDataBase64,
      image_edit_prompt: input.imageEditPrompt,
      lora_weight: input.loraWeight,
      width: input.width,
      height: input.height,
      seed: input.seed,
    },
    input.abortSignal,
  );
}

/** Fetch a Dreamina image task result by task id. */
export async function getDreaminaResult(
  input: DreaminaGetResultInput,
): Promise<DreaminaGetResultOutput> {
  return getResult(DREAMINA_REQ_KEYS.t2i, input);
}

/** Fetch a Dreamina inpaint task result by task id. */
export async function getDreaminaInpaintResult(
  input: DreaminaGetResultInput,
): Promise<DreaminaGetResultOutput> {
  return getResult(DREAMINA_REQ_KEYS.inpaint, input);
}

/** Fetch a Dreamina material extraction task result by task id. */
export async function getDreaminaMaterialExtractionResult(
  input: DreaminaGetResultInput,
): Promise<DreaminaGetResultOutput> {
  return getResult(DREAMINA_REQ_KEYS.material, input);
}

async function submitTask(
  reqKey: string,
  payload: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<DreaminaSubmitResult> {
  const config = await getDreaminaConfig();
  const data = await callDreaminaApi<{ task_id?: string }>(
    config,
    "CVSync2AsyncSubmitTask",
    {
      req_key: reqKey,
      ...payload,
    },
    abortSignal,
  );
  const taskId = data?.task_id?.trim();
  if (!taskId) throw new Error("提交任务失败：task_id 为空");
  return { taskId };
}

async function getResult(
  reqKey: string,
  input: DreaminaGetResultInput,
): Promise<DreaminaGetResultOutput> {
  const config = await getDreaminaConfig();
  const data = await callDreaminaApi<{
    status?: string;
    image_urls?: string[] | null;
    binary_data_base64?: string[] | null;
  }>(
    config,
    "CVSync2AsyncGetResult",
    {
      req_key: reqKey,
      task_id: input.taskId,
      req_json: normalizeReqJson(input.reqJson),
    },
    input.abortSignal,
  );
  return {
    status: data?.status ?? "unknown",
    imageUrls: data?.image_urls ?? null,
    binaryDataBase64: data?.binary_data_base64 ?? null,
  };
}
