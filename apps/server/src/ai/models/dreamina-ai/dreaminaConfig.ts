import { getProviderSettings } from "@/modules/settings/settingsService";

const PROVIDER_ID = "volcengine";

export const DREAMINA_REGION = "cn-north-1";
export const DREAMINA_SERVICE = "cv";
export const DREAMINA_VERSION = "2022-08-31";
export const DREAMINA_CONTENT_TYPE = "application/json";

export const DREAMINA_REQ_KEYS = {
  t2i: "jimeng_t2i_v40",
  inpaint: "jimeng_image2image_dream_inpaint",
  material: "i2i_material_extraction",
  video: "jimeng_ti2v_v30_pro",
} as const;

export type DreaminaProviderConfig = {
  /** 接口地址 */
  apiUrl: string;
  /** AccessKey */
  accessKeyId: string;
  /** SecretAccessKey */
  secretAccessKey: string;
};

/** Load Dreamina provider config from settings. */
export async function getDreaminaConfig(): Promise<DreaminaProviderConfig> {
  const providers = await getProviderSettings();
  // 中文注释：providerId 字段用于区分服务商，固定为 volcengine。
  const entry = providers.find((item) => item.providerId === PROVIDER_ID);
  if (!entry) {
    throw new Error(`未找到 ${PROVIDER_ID} 服务商配置`);
  }
  const accessKeyId = entry.authConfig.accessKeyId;
  const secretAccessKey = entry.authConfig.secretAccessKey;
  if (typeof accessKeyId !== "string" || typeof secretAccessKey !== "string") {
    throw new Error("Dreamina 认证信息缺失");
  }
  if (!entry.apiUrl.trim()) throw new Error("Dreamina apiUrl 未配置");
  return {
    apiUrl: entry.apiUrl.trim(),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
  };
}
