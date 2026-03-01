#!/bin/sh
set -e

# ── node_modules（首次运行时安装，Docker volume 持久化）───────
if [ ! -d /app/node_modules/.pnpm ]; then
  echo "[setup] 首次运行，安装依赖..."
  pnpm config set store-dir /root/.local/share/pnpm/store
  cd /app && pnpm install --frozen-lockfile

  # pnpm v10 默认屏蔽 postinstall 脚本（onlyBuiltDependencies 白名单机制）
  # 直接调用 node-gyp / postinstall 绕过白名单限制
  echo "[setup] 重建 better-sqlite3..."
  cd /app/node_modules/better-sqlite3 && npx --yes node-gyp rebuild 2>&1 | tail -3
  echo "[setup] 安装 esbuild 二进制..."
  node /app/node_modules/esbuild/install.js
  echo "[setup] 重建 node-pty..."
  cd /app/node_modules/node-pty && npx --yes node-gyp rebuild 2>&1 | tail -3
  echo "[setup] 安装 sharp 平台二进制..."
  SHARP_ARCH=$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/x64/')
  for pkg in "sharp-libvips-linuxmusl-${SHARP_ARCH}" "sharp-linuxmusl-${SHARP_ARCH}"; do
    mkdir -p /app/node_modules/@img/${pkg}
    cd /tmp && npm pack "@img/${pkg}" 2>/dev/null \
      && tar xzf img-${pkg}-*.tgz -C /app/node_modules/@img/${pkg} --strip-components=1 \
      && rm -f /tmp/img-${pkg}-*.tgz
  done
  echo "[setup] 生成 Prisma 引擎..."
  cd /app/node_modules/@prisma/engines && node scripts/postinstall.js
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
cd /app && pnpm run db:push

echo "[setup] 运行行为测试..."
cd /app/apps/server && exec "$@"
