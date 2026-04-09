/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface CertPair {
  key: Buffer;
  cert: Buffer;
}

const KEY_NAME = "localhost-key.pem";
const CERT_NAME = "localhost.pem";

/**
 * Ensure a TLS certificate pair exists in `certDir`.
 * Generates one on first run using mkcert (preferred) or openssl (fallback).
 * Returns the loaded key/cert buffers, or `null` if generation failed.
 */
export function ensureCerts(certDir: string): CertPair | null {
  const keyPath = path.join(certDir, KEY_NAME);
  const certPath = path.join(certDir, CERT_NAME);

  // Already exists — load and return.
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    } catch {
      // Corrupted file — regenerate below.
    }
  }

  fs.mkdirSync(certDir, { recursive: true });

  // Try mkcert first — produces a cert trusted by the system root store.
  if (tryMkcert(keyPath, certPath)) {
    return loadCerts(keyPath, certPath);
  }

  // Fallback: openssl self-signed cert (browser will show a warning unless
  // Electron's certificate-error handler accepts it).
  if (tryOpenssl(keyPath, certPath)) {
    return loadCerts(keyPath, certPath);
  }

  return null;
}

// ---------------------------------------------------------------------------

function loadCerts(keyPath: string, certPath: string): CertPair | null {
  try {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  } catch {
    return null;
  }
}

function tryMkcert(keyPath: string, certPath: string): boolean {
  try {
    execSync("which mkcert", { stdio: "ignore" });
    execSync(
      `mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost 127.0.0.1 ::1`,
      { stdio: "inherit" },
    );
    return fs.existsSync(keyPath) && fs.existsSync(certPath);
  } catch {
    return false;
  }
}

function tryOpenssl(keyPath: string, certPath: string): boolean {
  try {
    execSync(
      `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 ` +
        `-keyout "${keyPath}" -out "${certPath}" -days 365 -nodes ` +
        `-subj "/CN=localhost" ` +
        `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"`,
      { stdio: "inherit" },
    );
    return fs.existsSync(keyPath) && fs.existsSync(certPath);
  } catch {
    return false;
  }
}
