/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

export interface CertPair {
  key: Buffer;
  cert: Buffer;
}

// 嵌入式自签名 localhost 证书（EC prime256v1，有效期 100 年）。
// 仅用于 Electron 主进程 ↔ 内嵌 server 的 loopback TLS，满足 HTTP/2 的 TLS 要求。
// 证书作用域限定 localhost / 127.0.0.1 / ::1，私钥公开无实际攻击面：
// 攻击者若能嗅探 loopback 流量，说明已拿到本机代码执行权限。
// 这样避免了每台设备运行时调用 mkcert/openssl 生成（Windows 上通常两者都没有）。
const EMBEDDED_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgNoeW8muvPNpXloyS
YwBK/H7pK+/VdncLZRkGD9nsRIOhRANCAARi/sDUbfz0e/JIqtEqq7AdSqDi/dkv
M8AYfbrH0pcAMKQwUVPr93lSDP+3Mt0Mh5GKShDhO8v4o0eMq8SBoLVW
-----END PRIVATE KEY-----
`;

const EMBEDDED_CERT = `-----BEGIN CERTIFICATE-----
MIIBrTCCAVSgAwIBAgIUM6w0tIABIdsvrSMqSh23uBxaC+8wCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MDQxMzAxNTYyMFoYDzIxMjYwMzIw
MDE1NjIwWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARi/sDUbfz0e/JIqtEqq7AdSqDi/dkvM8AYfbrH0pcAMKQwUVPr93lS
DP+3Mt0Mh5GKShDhO8v4o0eMq8SBoLVWo4GBMH8wHQYDVR0OBBYEFDHQlnBKBZNt
2kseb14dViHQQm+kMB8GA1UdIwQYMBaAFDHQlnBKBZNt2kseb14dViHQQm+kMA8G
A1UdEwEB/wQFMAMBAf8wLAYDVR0RBCUwI4IJbG9jYWxob3N0hwR/AAABhxAAAAAA
AAAAAAAAAAAAAAABMAoGCCqGSM49BAMCA0cAMEQCICB72tHpyakbHWP7vJVLrvSl
p3QTjRu0sJnIdaC/mUsUAiAemFRWcnk3iQqEbzgttwEO5iJVxyTWQA0RTewO0Ada
vg==
-----END CERTIFICATE-----
`;

export function loadEmbeddedCerts(): CertPair {
  return {
    key: Buffer.from(EMBEDDED_KEY),
    cert: Buffer.from(EMBEDDED_CERT),
  };
}
