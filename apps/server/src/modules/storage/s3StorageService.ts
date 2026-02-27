/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { S3ObjectTagging, S3ProviderConfig, StorageObjectRef } from "@openloaf/api/types/storage";
import { DEFAULT_S3_EXPIRE_DAYS } from "@openloaf/api/types/storage";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { logger } from "@/common/logger";
import type { S3ProviderConf } from "@/modules/settings/settingConfigTypes";

import {
  buildS3ClientConfig,
  getS3Client,
  type S3ClientConfig,
  resolveS3Template,
} from "./s3Client";

export type PutS3ObjectInput = {
  /** Object key in the bucket. */
  key: string;
  /** Object body data for upload. */
  body: Uint8Array | Buffer | Readable;
  /** Content type for the object. */
  contentType?: string;
  /** Byte length when known. */
  contentLength?: number;
  /** Object tagging for lifecycle rules. */
  tagging?: S3ObjectTagging;
};

export type DeleteS3ObjectInput = {
  /** Object key in the bucket. */
  key: string;
};

export type S3StorageService = {
  /**
   * Upload an object into the configured bucket.
   */
  putObject: (input: PutS3ObjectInput) => Promise<StorageObjectRef>;
  /**
   * Delete an object from the configured bucket.
   */
  deleteObject: (input: DeleteS3ObjectInput) => Promise<void>;
  /**
   * Build a public URL for the object key.
   */
  getPublicUrl: (key: string) => string;
};

/**
 * Create a base S3 storage service with provider configuration.
 */
export function createS3StorageService(provider: S3ProviderConfig): S3StorageService {
  const config = buildS3ClientConfig(provider);

  return {
    async putObject(input: PutS3ObjectInput) {
      const client = getS3Client(config);
      // 默认写入 1 天过期标签，供桶生命周期规则自动清理。
      const tagging = input.tagging ?? { expireDays: DEFAULT_S3_EXPIRE_DAYS };
      const taggingHeader = formatS3TaggingHeader(tagging);

      logger.debug(
        {
          providerId: config.providerId,
          endpoint: config.endpoint,
          region: config.region,
          bucket: config.bucket,
          key: input.key,
          contentType: input.contentType,
          contentLength: input.contentLength,
          forcePathStyle: config.forcePathStyle,
          tagging: taggingHeader,
        },
        "S3 upload request",
      );

      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
          Tagging: taggingHeader,
        }),
      );

      logger.debug(
        {
          providerId: config.providerId,
          bucket: config.bucket,
          key: input.key,
          url: resolveS3PublicUrl(config, input.key),
        },
        "S3 upload completed",
      );

      return {
        key: input.key,
        url: resolveS3PublicUrl(config, input.key),
        provider: "s3",
      };
    },
    async deleteObject(input: DeleteS3ObjectInput) {
      const client = getS3Client(config);
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
        }),
      );
    },
    getPublicUrl(key: string) {
      return resolveS3PublicUrl(config, key);
    },
  };
}

/**
 * Build a public URL for a key based on provider configuration.
 */
export function resolveS3PublicUrl(config: S3ClientConfig, key: string): string {
  if (config.publicBaseUrl) {
    const baseUrl = resolveS3Template(config.publicBaseUrl, config);
    return joinUrl(baseUrl, key);
  }

  if (config.endpoint) {
    const rawEndpoint = config.endpoint.replace(/\/$/, "");
    const endpoint = resolveS3Template(rawEndpoint, config);

    // endpoint 可能包含 {bucket}/{region} 占位符，用于虚拟托管域名格式。
    if (rawEndpoint.includes("{bucket}") || rawEndpoint.includes("{region}")) {
      return joinUrl(endpoint, key);
    }

    // forcePathStyle 时显式拼接 bucket，否则默认假设 endpoint 指向 bucket 域名。
    if (config.forcePathStyle) {
      return joinUrl(`${endpoint}/${config.bucket}`, key);
    }

    return joinUrl(endpoint, key);
  }

  return `s3://${config.bucket}/${key}`;
}

/**
 * Build the S3 tagging header string for lifecycle rules.
 */
export function formatS3TaggingHeader(tagging?: S3ObjectTagging): string | undefined {
  if (!tagging) return undefined;
  const pairs: string[] = [];

  // 生命周期策略统一使用 expire-days 标签。
  if (typeof tagging.expireDays === "number") {
    pairs.push(`expire-days=${encodeURIComponent(String(tagging.expireDays))}`);
  }

  return pairs.length > 0 ? pairs.join("&") : undefined;
}

/**
 * Map S3 provider config from stored settings.
 */
export function resolveS3ProviderConfig(entry: S3ProviderConf): S3ProviderConfig {
  return {
    providerId: entry.providerId,
    endpoint: entry.endpoint,
    region: entry.region,
    bucket: entry.bucket,
    accessKeyId: entry.accessKeyId,
    secretAccessKey: entry.secretAccessKey,
    forcePathStyle: entry.forcePathStyle,
    publicBaseUrl: entry.publicBaseUrl,
  };
}

/**
 * Join base URL with object key.
 */
function joinUrl(base: string, key: string): string {
  const trimmedBase = base.replace(/\/$/, "");
  const trimmedKey = key.replace(/^\//, "");
  return `${trimmedBase}/${trimmedKey}`;
}
