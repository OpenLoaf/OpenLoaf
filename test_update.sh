#!/bin/bash

# 使用固定的WebSocket URL进行测试
ws_url="ws://127.0.0.1:9777/devtools/browser/test-url"

echo "Testing with WebSocket URL: $ws_url"

# 创建测试配置文件
cat > test_config.toml << EOF
[mcp_servers.chrome-devtools]
command = "npx"
args = ["chrome-devtools-mcp@latest","--wsEndpoint=ws://127.0.0.1:9777/devtools/browser/old-url"]
EOF

echo "Original config:"
cat test_config.toml

# 使用修复后的sed命令进行替换
sed -i '' "s|--wsEndpoint=[^\"]*\"|--wsEndpoint=$ws_url\"|" test_config.toml

echo -e "\nUpdated config:"
cat test_config.toml

# 验证修复结果
if grep -q '"$' test_config.toml; then
    echo -e "\n✓ Success: Configuration file has the closing quote"
else
    echo -e "\n✗ Failure: Configuration file is missing the closing quote"
fi

# 清理测试文件
rm test_config.toml