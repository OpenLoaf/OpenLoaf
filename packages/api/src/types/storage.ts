export type StorageProviderKind = "local" | "s3";

/** Default lifecycle expire days for S3 objects. */
export const DEFAULT_S3_EXPIRE_DAYS = 1;

export type S3ProviderConfig = {
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

export type S3ObjectTagging = {
  /** Expire days used by bucket lifecycle rules. */
  expireDays?: number;
};

export type StorageObjectRef = {
  /** Object key in the provider. */
  key: string;
  /** Public or signed URL to access the object. */
  url: string;
  /** Provider kind for the object. */
  provider: StorageProviderKind;
};
