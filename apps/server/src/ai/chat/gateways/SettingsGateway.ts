import type { SettingsRepository } from "@/ai/chat/SettingsRepository";
import { readBasicConf, readS3Providers } from "@/modules/settings/tenasConfStore";
import type { BasicConf, S3ProviderConf } from "@/modules/settings/settingConfigTypes";

export class SettingsGateway implements SettingsRepository {
  /** Read the basic settings snapshot. */
  readBasicConf(): BasicConf {
    return readBasicConf();
  }

  /** Read configured S3 providers. */
  readS3Providers(): S3ProviderConf[] {
    return readS3Providers();
  }
}
