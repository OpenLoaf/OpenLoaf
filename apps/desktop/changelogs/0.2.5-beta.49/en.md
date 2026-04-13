### 🐛 Bug Fixes
- **HTTP/2 bootstrap**: embed a self-signed localhost certificate so the Electron ↔ server loopback TLS works on fresh installs without mkcert or openssl (fixes HTTP/2 falling back to HTTP/1.1 on Windows machines that lack either tool). Private key is scoped to localhost / 127.0.0.1 / ::1 only.
