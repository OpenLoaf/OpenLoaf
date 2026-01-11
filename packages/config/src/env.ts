export type CdpConfig = {
  host: string;
  port: number;
  baseUrl: string;
  versionUrl: string;
};

type EnvSource = Record<string, string | undefined>;

export type EnvStringOptions = {
  defaultValue?: string;
  required?: boolean;
};

export const getEnvString = (
  env: EnvSource,
  key: string,
  opts: EnvStringOptions = {}
): string | undefined => {
  const value = env[key];
  if (value != null && value !== "") return value;
  if (opts.defaultValue != null) return opts.defaultValue;
  if (opts.required) throw new Error(`Missing required env var: ${key}`);
  return undefined;
};

export type EnvIntOptions = {
  defaultValue?: number;
  required?: boolean;
};

export const getEnvInt = (
  env: EnvSource,
  key: string,
  opts: EnvIntOptions = {}
): number | undefined => {
  const raw = env[key];
  if (raw == null || raw === "") {
    if (opts.defaultValue != null) return opts.defaultValue;
    if (opts.required) throw new Error(`Missing required env var: ${key}`);
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    if (opts.defaultValue != null) return opts.defaultValue;
    throw new Error(`Invalid integer env var: ${key}=${raw}`);
  }
  return parsed;
};

export type GetCdpConfigOptions = {
  hostKey?: string;
  portKey?: string;
  defaultHost?: string;
  defaultPort?: number;
};

export const getCdpConfig = (
  env: EnvSource = process.env,
  opts: GetCdpConfigOptions = {}
): CdpConfig => {
  const hostKey = opts.hostKey ?? "TENAS_REMOTE_DEBUGGING_HOST";
  const portKey = opts.portKey ?? "TENAS_REMOTE_DEBUGGING_PORT";

  const host = getEnvString(env, hostKey, {
    defaultValue: opts.defaultHost ?? "127.0.0.1",
  })!;
  const port = getEnvInt(env, portKey, { defaultValue: opts.defaultPort ?? 9777 })!;

  const baseUrl = `http://${host}:${port}`;
  const versionUrl = `${baseUrl}/json/version`;

  return { host, port, baseUrl, versionUrl };
};
