#!/bin/sh
set -e

# ── node_modules（首次运行时安装，Docker volume 持久化）───────
if [ ! -d /app/node_modules/.pnpm ]; then
  echo "[setup] 首次运行，安装依赖（约 2-3 分钟）..."
  cd /app && pnpm install --frozen-lockfile
else
  echo "[setup] node_modules 已缓存，跳过安装"
fi

# ── providers.json ──────────────────────────────────────────
# 优先级：.env 模板模式 > 宿主机直接复制
if [ -n "$TEST_API_KEY" ]; then
  echo "[setup] 检测到 .env 配置，通过模板生成 providers.json..."
  envsubst < /root/.openloaf/providers.json.template > /root/.openloaf/providers.json
elif [ -f /host-openloaf/providers.json ]; then
  echo "[setup] 从宿主机 ~/.openloaf/ 复制 providers.json..."
  cp /host-openloaf/providers.json /root/.openloaf/providers.json
else
  echo "[setup] ⚠ 未找到 providers.json（无 .env 且宿主机无配置），测试可能失败"
fi

# ── auth.json（SaaS token）──────────────────────────────────
if [ -z "$OPENLOAF_SAAS_ACCESS_TOKEN" ] && [ -f /host-openloaf/auth.json ]; then
  echo "[setup] 从宿主机 ~/.openloaf/ 复制 auth.json..."
  cp /host-openloaf/auth.json /root/.openloaf/auth.json
fi

# 有 SaaS token 时切换为 cloud 模式
if [ -n "$OPENLOAF_SAAS_ACCESS_TOKEN" ]; then
  node -e "
    const fs = require('fs');
    const p = '/root/.openloaf/settings.json';
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    cfg.basic.chatSource = 'cloud';
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
    console.log('[setup] chatSource 切换为 cloud');
  "
fi

echo "[setup] 初始化数据库..."
cd /app && pnpm run db:push --skip-generate

echo "[setup] 运行行为测试..."
cd /app/apps/server && exec "$@"
