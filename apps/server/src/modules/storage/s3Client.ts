import type { S3ProviderConfig } from "@openloaf/api/types/storage";
import { S3Client } from "@aws-sdk/client-s3";

export type S3ClientConfig = {
  /** Provider id from settings. */
  providerId: string;
  /** Custom endpoint for S3-compatible providers. */
  endpoint?: string;
  /** Region name for S3-compatible providers. */
  region?: string;
  /** Bucket name for the provider. */
  bucket: string;
  /** Access key id for the provider. */
  accessKeyId: string;
  /** Secret access key for the provider. */
  secretAccessKey: string;
  /** Force path-style addressing when required by providers. */
  forcePathStyle?: boolean;
  /** Public base URL for CDN or custom domain. */
  publicBaseUrl?: string;
};

/**
 * Build a normalized S3 client config from provider settings.
 */
export function buildS3ClientConfig(provider: S3ProviderConfig): S3ClientConfig {
  return {
    providerId: provider.providerId,
    endpoint: provider.endpoint,
    region: provider.region,
    bucket: provider.bucket,
    accessKeyId: provider.accessKeyId,
    secretAccessKey: provider.secretAccessKey,
    forcePathStyle: provider.forcePathStyle,
    publicBaseUrl: provider.publicBaseUrl,
  };
}

const s3ClientCache = new Map<string, S3Client>();

/**
 * Create or reuse a cached S3 client for the provider config.
 */
export function getS3Client(config: S3ClientConfig): S3Client {
  const cacheKey = buildS3ClientCacheKey(config);
  const cached = s3ClientCache.get(cacheKey);
  if (cached) return cached;

  const endpoint = resolveS3Endpoint(config);

  // 使用静态配置初始化客户端，避免运行时重复创建连接池。
  const client = new S3Client({
    region: config.region ?? "us-east-1",
    endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  s3ClientCache.set(cacheKey, client);
  return client;
}

/**
 * Build a stable cache key for S3 client reuse.
 */
function buildS3ClientCacheKey(config: S3ClientConfig): string {
  // 缓存键包含关键连接参数，保证配置变化时能重建客户端。
  return JSON.stringify({
    providerId: config.providerId,
    endpoint: resolveS3Endpoint(config) ?? "",
    region: config.region ?? "",
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    forcePathStyle: Boolean(config.forcePathStyle),
  });
}

/**
 * Resolve S3 endpoint with optional placeholders.
 */
function resolveS3Endpoint(config: S3ClientConfig): string | undefined {
  const raw = config.endpoint?.trim();
  if (!raw) return undefined;
  let resolved = resolveS3Template(raw, config);

  const prefix = `${config.bucket}.`;
  const stripBucketPrefix = (host: string) => {
    let normalized = host;
    while (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
    }
    return normalized || host;
  };

  // 如果用户填写了包含 bucket 的域名，自动去掉 bucket，避免 SDK 二次拼接。
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(resolved)) {
    try {
      const url = new URL(resolved);
      url.hostname = stripBucketPrefix(url.hostname);
      return url.toString().replace(/\/$/, "");
    } catch {
      // 解析失败则回退到字符串处理。
    }
  }

  const [host, ...rest] = resolved.split("/");
  if (!host) return resolved;
  const nextHost = stripBucketPrefix(host);
  return [nextHost, ...rest].join("/");
}

/**
 * Resolve {bucket}/{region} placeholders in endpoints.
 */
export function resolveS3Template(
  raw: string,
  config: Pick<S3ClientConfig, "bucket" | "region">,
): string {
  let resolved = raw;
  if (resolved.includes("{bucket}") || resolved.includes("{region}")) {
    // 支持 {bucket}/{region} 占位符，便于兼容 COS 等域名模板。
    resolved = resolved
      .replace("{bucket}", config.bucket)
      .replace("{region}", config.region ?? "");
  }
  return resolved;
}
