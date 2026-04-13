### 🐛 修复
- **HTTP/2 启动**：内嵌自签 localhost 证书，Electron ↔ 内嵌 server 的 loopback TLS 在没有 mkcert / openssl 的全新环境（尤其是 Windows）也能正常建连，不再降级到 HTTP/1.1。证书作用域限定在 localhost / 127.0.0.1 / ::1。
