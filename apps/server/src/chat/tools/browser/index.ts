import { browserTools } from "../../browser";

const cdpPort = process.env.TEATIME_REMOTE_DEBUGGING_PORT ?? "9777";
const cdpHost = process.env.TEATIME_REMOTE_DEBUGGING_HOST ?? "127.0.0.1";
const cdpBaseUrl = `http://${cdpHost}:${cdpPort}`;

const CDP_LOGGED_KEY = "__teatime_cdp_address_logged__";
if (!(globalThis as any)[CDP_LOGGED_KEY] && process.env.NODE_ENV !== "test") {
  (globalThis as any)[CDP_LOGGED_KEY] = true;
  console.log(`[browserTools] CDP address: ${cdpBaseUrl}`);
  console.log(`[browserTools] CDP version endpoint: ${cdpBaseUrl}/json/version`);
}

export { browserTools };
