#!/usr/bin/env bash
# 在 Docker 容器内启动 production 服务（web + server）
set -e

# 确保容器运行
docker compose up -d

# 数据库迁移
docker exec openloaf-dev sh -c "cd /app && pnpm run db:migrate"

# 停掉已有进程
docker exec openloaf-dev sh -c "
  for p in /proc/[0-9]*; do
    pid=\$(basename \$p)
    [ \"\$pid\" = 1 ] && continue
    c=\$(cat \$p/comm 2>/dev/null)
    case \$c in node|'next-server (v1'*|serve) kill -9 \$pid 2>/dev/null ;;
    esac
  done
  sleep 2
" || true

# 启动 server
docker exec -d openloaf-dev sh -c "
  cd /app/apps/server && HOST=0.0.0.0 PORT=23333 node dist/index.mjs > /tmp/server.log 2>&1
"

# 启动 web 静态服务
docker exec -d openloaf-dev sh -c "
  cd /app/apps/web && npx -y serve@latest out -l 3001 > /tmp/web.log 2>&1
"

sleep 5
echo "✅ Server: http://localhost:13333"
echo "✅ Web:    http://localhost:3100"
echo ""
echo "日志: docker exec openloaf-dev tail -f /tmp/server.log"
echo "      docker exec openloaf-dev tail -f /tmp/web.log"
