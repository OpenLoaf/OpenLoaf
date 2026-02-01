export type SaasMediaSubmitArgs = {
  /** SaaS model id. */
  modelId: string;
  /** Input payload to SaaS. */
  input: Record<string, unknown>;
};

export type SaasMediaTaskResult = {
  /** Task identifier. */
  taskId: string;
  /** Task status. */
  status: "queued" | "running" | "succeeded" | "failed";
  /** Result asset URLs. */
  resultUrls?: string[];
};

/** Submit a SaaS media task. */
export async function submitMediaTask(
  _input: SaasMediaSubmitArgs,
): Promise<SaasMediaTaskResult> {
  // 逻辑：占位实现，后续接入 SaaS 任务提交。
  throw new Error("not_implemented");
}

/** Poll a SaaS media task by id. */
export async function pollMediaTask(_taskId: string): Promise<SaasMediaTaskResult> {
  // 逻辑：占位实现，后续接入 SaaS 任务轮询。
  throw new Error("not_implemented");
}
