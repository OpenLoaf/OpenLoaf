import type { BasicConf, S3ProviderConf } from "@/modules/settings/settingConfigTypes";

export interface SettingsRepository {
  /** Read the basic settings snapshot. */
  readBasicConf(): BasicConf;
  /** Read configured S3 providers. */
  readS3Providers(): S3ProviderConf[];
}
