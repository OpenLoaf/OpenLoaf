import { browserTools } from "../../browser";
import { getCdpConfig } from "@teatime-ai/config";

const { baseUrl: cdpBaseUrl, versionUrl: cdpVersionUrl } = getCdpConfig();

export { browserTools };
