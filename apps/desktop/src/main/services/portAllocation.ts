import net from 'node:net';

export type RuntimePorts = {
  serverUrl: string;
  webUrl: string;
  cdpPort: number;
};

/**
 * Checks whether a host:port pair is available for binding.
 */
export async function isPortFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

/**
 * Allocates a free port from the OS.
 */
export async function getFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port')));
        return;
      }
      const port = addr.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

/**
 * Ensures a free port that does not collide with the current allocation set.
 */
async function getUniqueFreePort(host: string, used: Set<number>): Promise<number> {
  // 中文注释：同一轮启动内确保端口不重复，避免 web/server/cdp 互相冲突。
  while (true) {
    const port = await getFreePort(host);
    if (!used.has(port)) {
      used.add(port);
      return port;
    }
  }
}

/**
 * Parses a numeric port from a URL string when possible.
 */
function tryExtractPort(rawUrl: string): number | null {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.port) return null;
    const port = Number.parseInt(parsed.port, 10);
    return Number.isFinite(port) ? port : null;
  } catch {
    return null;
  }
}

/**
 * Resolves runtime ports for server/web/CDP, falling back to random free ports when unset.
 */
export async function resolveRuntimePorts(args: {
  serverUrlEnv?: string;
  webUrlEnv?: string;
  cdpPortEnv?: string;
  cdpHostEnv?: string;
  defaultHost?: string;
  /** Whether the app is running in packaged production mode. */
  isPackaged?: boolean;
}): Promise<RuntimePorts> {
  const defaultHost = args.defaultHost ?? '127.0.0.1';
  const usedPorts = new Set<number>();

  // 中文注释：区分开发/生产默认端口，避免两种模式同时启动时端口冲突。
  const defaults = args.isPackaged
    ? { server: 23333, web: 53663, cdp: 53664 }
    : { server: 23334, web: 53665, cdp: 53666 };
  const defaultServerPort = defaults.server;
  const defaultWebPort = defaults.web;
  const defaultCdpPort = defaults.cdp;

  // 中文注释：如果用户显式提供 URL，则直接复用，默认情况下才随机分配。
  let serverUrl = args.serverUrlEnv?.trim() ?? '';
  if (!serverUrl) {
    const preferredPort = defaultServerPort;
    const canUsePreferred =
      !usedPorts.has(preferredPort) &&
      (await isPortFree(defaultHost, preferredPort));
    const serverPort = canUsePreferred
      ? preferredPort
      : await getUniqueFreePort(defaultHost, usedPorts);
    if (canUsePreferred) usedPorts.add(preferredPort);
    serverUrl = `http://${defaultHost}:${serverPort}`;
  } else {
    const port = tryExtractPort(serverUrl);
    if (port != null) usedPorts.add(port);
  }

  let webUrl = args.webUrlEnv?.trim() ?? '';
  if (!webUrl) {
    const preferredPort = defaultWebPort;
    const canUsePreferred =
      !usedPorts.has(preferredPort) && (await isPortFree(defaultHost, preferredPort));
    const webPort = canUsePreferred
      ? preferredPort
      : await getUniqueFreePort(defaultHost, usedPorts);
    if (canUsePreferred) usedPorts.add(preferredPort);
    webUrl = `http://${defaultHost}:${webPort}`;
  } else {
    const port = tryExtractPort(webUrl);
    if (port != null) usedPorts.add(port);
  }

  const cdpPortRaw = args.cdpPortEnv?.trim();
  const cdpPortParsed =
    cdpPortRaw && Number.isFinite(Number.parseInt(cdpPortRaw, 10))
      ? Number.parseInt(cdpPortRaw, 10)
      : null;

  const cdpHost = args.cdpHostEnv?.trim() || defaultHost;
  let cdpPort: number;
  if (cdpPortParsed != null && !usedPorts.has(cdpPortParsed)) {
    usedPorts.add(cdpPortParsed);
    cdpPort = cdpPortParsed;
  } else {
    const preferredPort = defaultCdpPort;
    const canUsePreferred =
      !usedPorts.has(preferredPort) && (await isPortFree(cdpHost, preferredPort));
    if (canUsePreferred) {
      usedPorts.add(preferredPort);
      cdpPort = preferredPort;
    } else {
      // 中文注释：避免 CDP 端口与 web/server 冲突，必要时重新分配。
      cdpPort = await getUniqueFreePort(cdpHost, usedPorts);
    }
  }

  return { serverUrl, webUrl, cdpPort };
}
