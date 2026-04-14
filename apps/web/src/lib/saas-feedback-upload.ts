/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { CLIENT_HEADERS } from "@/lib/client-headers";
import { resolveSaasProxyBaseUrl } from "@/lib/saas-auth";

type FeedbackAttachmentResponse = {
  /** Public URL of the uploaded attachment. */
  url: string;
  /** Object storage key for the uploaded attachment. */
  key: string;
};

/**
 * Upload a feedback attachment via the local reverse proxy.
 *
 * The SaaS SDK's `feedback.uploadAttachment` uses `global fetch` directly and
 * does NOT merge the SaaSClient static headers, so it cannot pass the server
 * `strictClientGuard` CSRF check. We reimplement the call here with a plain
 * multipart POST that explicitly injects `X-OpenLoaf-Client`.
 */
export async function uploadFeedbackAttachmentViaProxy(
  file: File | Blob,
  filename?: string,
): Promise<FeedbackAttachmentResponse> {
  const base = resolveSaasProxyBaseUrl();
  if (!base) {
    throw new Error("saas_proxy_base_url_missing");
  }
  const form = new FormData();
  form.append(
    "file",
    file,
    filename ?? (file instanceof File ? file.name : "attachment"),
  );
  const response = await fetch(`${base}/api/feedback/upload`, {
    method: "POST",
    credentials: "include",
    // 逻辑：不显式设置 Content-Type —— 浏览器会自动带 multipart boundary。
    headers: { ...CLIENT_HEADERS },
    body: form,
  });
  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ message: "Upload failed" }));
    throw new Error((err as { message?: string }).message ?? "Upload failed");
  }
  return (await response.json()) as FeedbackAttachmentResponse;
}
