# Auth0 Electron Login Flow (PKCE + System Browser)

## 概述

该方案用于 Electron 客户端通过系统浏览器完成 Auth0 登录，使用 PKCE 获取 OAuth2 Token。
登录状态由本地 server 维护，web 端通过轮询获取当前状态。

目标：
- 系统浏览器登录（避免内嵌 WebView）
- Auth0 PKCE 交换 token
- access_token 仅内存保存
- refresh_token 写入 `tenas.conf`（明文）
- web 端 1s 轮询登录状态
- 登录成功后定时获取 SaaS 余额
- 允许用户取消登录

---

## 配置

### Auth0 Application (Native)
- Allowed Callback URLs：
  - `http://127.0.0.1:23333/auth/callback`
- Allowed Logout URLs：
  - `http://127.0.0.1:3001/login`（或自定义）
- 允许 Refresh Token / Offline Access：
  - 勾选 Refresh Token 相关 grant
  - API 勾选 Allow Offline Access

### 环境变量（server）
```
AUTH0_DOMAIN=xxx.jp.auth0.com
AUTH0_CLIENT_ID=xxxxxxxx
AUTH0_AUDIENCE=https://your-api
AUTH0_REDIRECT_URI=http://127.0.0.1:23333/auth/callback
AUTH0_SCOPE=openid profile email offline_access
TENAS_SAAS_URL=http://localhost:3000
```

---

## 流程图

### 主流程
```
Web 点击登录
  -> GET /auth/login-url
    -> Server 生成 state + PKCE
    -> 返回 authorizeUrl
  -> Electron openExternal(authorizeUrl)
    -> 系统浏览器完成 Auth0 登录
      -> 回调 http://127.0.0.1:23333/auth/callback?code&state
        -> Server 校验 state
        -> /oauth/token 交换 token
           - access_token 内存
           - refresh_token 写入 tenas.conf
  -> Web 每 1s 轮询 GET /auth/session
     -> loggedIn = true
     -> UI 显示已登录
  -> Web 每 10s 轮询 GET /auth/balance
     -> Server 使用 access_token 请求 SaaS
     -> UI 显示余额
```

### 取消流程
```
Web 点击取消
  -> 停止轮询
  -> POST /auth/cancel
    -> Server 清理 PKCE state
  -> UI 关闭登录模态
```

---

## 接口定义

### GET /auth/login-url
返回：
```json
{ "authorizeUrl": "https://<AUTH0_DOMAIN>/authorize?..." }
```

### GET /auth/callback
功能：
- 校验 state
- code + verifier 换 token
- access_token 写内存
- refresh_token 写 `tenas.conf`
- 返回 HTML（含倒计时关闭）

### GET /auth/session
返回：
```json
{ "loggedIn": true, "user": { "email": "...", "name": "...", "picture": "..." } }
```

### GET /auth/balance
功能：
- 使用 access_token 访问 SaaS `/api/llm/balance`
- 返回 SaaS 响应数据

返回示例：
```json
{
  "success": true,
  "data": {
    "newApiUserId": "user_xxx",
    "quota": 100,
    "usedQuota": 40,
    "remainQuota": 60
  }
}
```

### POST /auth/cancel
返回：
```json
{ "ok": true }
```

### POST /auth/logout
返回：
```json
{ "ok": true }
```

---

## Token 存储策略

- access_token：仅内存保存
- refresh_token：`tenas.conf` 明文保存
- 启动时：
  - 读取 refresh_token
  - 自动刷新 access_token

---

## Web 侧状态机

状态：
- idle
- opening
- polling
- error

行为：
- 点击登录：opening -> polling
- 轮询成功：polling -> idle（登录成功）
- 轮询失败：polling -> error
- 取消登录：停止轮询 -> idle

---

## 关键实现文件

Server：
- `apps/server/src/modules/auth/auth0/auth0Client.ts`
- `apps/server/src/modules/auth/auth0/pkce.ts`
- `apps/server/src/modules/auth/auth0/tokenStore.ts`
- `apps/server/src/modules/auth/auth0/authRoutes.ts`
- `apps/server/src/modules/settings/tenasConfStore.ts`

Electron：
- `apps/electron/src/main/ipc/index.ts`
- `apps/electron/src/preload/index.ts`

Web：
- `apps/web/src/components/workspace/SidebarWorkspace.tsx`
- `apps/web/src/types/electron.d.ts`
