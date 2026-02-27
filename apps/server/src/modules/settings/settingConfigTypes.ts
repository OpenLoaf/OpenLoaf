/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ModelDefinition } from "@openloaf/api/common";
import type { BasicConfig } from "@openloaf/api/types/basic";

export type ModelProviderValue = {
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled models keyed by model id. */
  models: Record<string, ModelDefinition>;
  /** Optional provider options. */
  options?: {
    /** Whether to enable OpenAI Responses API. */
    enableResponsesApi?: boolean;
  };
};

export type ModelProviderConf = ModelProviderValue & {
  /** Stable provider entry id. */
  id: string;
  /** Display name stored as title. */
  title: string;
  /** Last update timestamp. */
  updatedAt: string;
};

export type S3ProviderValue = {
  /** Provider id. */
  providerId: string;
  /** Display label for UI. */
  providerLabel?: string;
  /** Endpoint URL. */
  endpoint?: string;
  /** Region name. */
  region?: string;
  /** Bucket name. */
  bucket: string;
  /** Force path-style addressing. */
  forcePathStyle?: boolean;
  /** Public base URL for CDN or custom domain. */
  publicBaseUrl?: string;
  /** Access key id. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
};

export type S3ProviderConf = S3ProviderValue & {
  /** Stable provider entry id. */
  id: string;
  /** Display name stored as title. */
  title: string;
  /** Last update timestamp. */
  updatedAt: string;
};

export type BasicConf = BasicConfig;

export type AuthConf = {
  /** Stored SaaS refresh token. */
  refreshToken?: string;
  /** Last update timestamp. */
  updatedAt?: string;
};
