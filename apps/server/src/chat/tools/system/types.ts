/**
 * System Tools 公共类型（MVP）
 * 说明：每个 tool 文件将直接使用 AI SDK v6 的 `tool()` 定义工具，并手写 metadata。
 * 这里仅保留风险分级与占位返回结构，便于复用。
 */

/**
 * System 工具风险分级（MVP）
 * - read：只读，不修改任何外部状态
 * - write：会产生修改，但非破坏性（需要 human-in-the-loop）
 * - destructive：破坏性操作（需要 human-in-the-loop，且通常需要更严格的审批）
 */
export type RiskType = "read" | "write" | "destructive";

/**
 * human-in-the-loop 审批信息（MVP）
 * 说明：这里先只做“形状定义”，真正的审批流程后续再接 UI/后端。
 */
export type ToolApproval = {
  approved: boolean;
  token?: string;
  reason?: string;
};

/**
 * 统一的工具返回结构（MVP）
 * - 不实现具体逻辑时，也保持工具返回可序列化 JSON，便于 agent 继续对话。
 */
export type SystemToolResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      approvalRequired?: boolean;
      error: {
        code: "NOT_IMPLEMENTED" | "APPROVAL_REQUIRED";
        message: string;
        riskType: RiskType;
      };
    };

export const notImplemented = <T>(riskType: RiskType): SystemToolResult<T> => ({
  ok: false,
  error: {
    code: "NOT_IMPLEMENTED",
    message: "该系统工具已定义，但内部逻辑尚未实现（MVP 占位）。",
    riskType,
  },
});

export const approvalRequired = <T>(
  riskType: Exclude<RiskType, "read">,
): SystemToolResult<T> => ({
  ok: false,
  approvalRequired: true,
  error: {
    code: "APPROVAL_REQUIRED",
    message: "该操作需要 human-in-the-loop 审批（MVP 占位）。",
    riskType,
  },
});
