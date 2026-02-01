import { SaaSHttpError, SaaSNetworkError, SaaSSchemaError } from "@tenas-saas/sdk";

/** Normalized SaaS error payload for API responses. */
export type SaasErrorResult = {
  /** HTTP status code to return. */
  status: number;
  /** Stable error code for caller. */
  code: "saas_request_failed" | "saas_invalid_payload" | "saas_network_failed";
  /** Raw payload from SaaS when available. */
  payload?: unknown;
  /** Schema issues when validation fails. */
  issues?: unknown;
  /** Network error cause. */
  cause?: unknown;
};

/** Map SDK errors into a normalized response shape. */
export function mapSaasError(error: unknown): SaasErrorResult | null {
  if (error instanceof SaaSHttpError) {
    // 逻辑：透传 SaaS 状态码并保留 payload。
    return { status: error.status, code: "saas_request_failed", payload: error.payload };
  }
  if (error instanceof SaaSSchemaError) {
    return { status: 502, code: "saas_invalid_payload", issues: error.issues };
  }
  if (error instanceof SaaSNetworkError) {
    return { status: 502, code: "saas_network_failed", cause: error.cause };
  }
  return null;
}
