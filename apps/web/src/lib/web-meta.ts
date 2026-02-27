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

import { trpcClient } from "@/utils/trpc";
import { normalizeUrl } from "@/components/browser/browser-utils";

export type WebMetaResult = {
  /** Whether capture succeeded. */
  ok: boolean;
  /** Requested url. */
  url: string;
  /** Page title text. */
  title?: string;
  /** Page description text. */
  description?: string;
  /** Relative logo path under .openloaf/desktop. */
  logoPath?: string;
  /** Relative preview path under .openloaf/desktop. */
  previewPath?: string;
  /** Error message when capture fails. */
  error?: string;
};

/** Capture web metadata through Electron or server fallback. */
export async function fetchWebMeta(input: {
  url: string;
  rootUri: string;
}): Promise<WebMetaResult> {
  const normalizedUrl = normalizeUrl(input.url);
  if (!normalizedUrl) {
    return { ok: false, url: input.url, error: "Invalid url" };
  }

  if (window.openloafElectron?.fetchWebMeta) {
    return await window.openloafElectron.fetchWebMeta({
      url: normalizedUrl,
      rootUri: input.rootUri,
    });
  }

  return await trpcClient.webMeta.capture.mutate({
    url: normalizedUrl,
    rootUri: input.rootUri,
  });
}
