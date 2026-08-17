#!/bin/bash
# launch-chrome.sh — macOS/Linux：启动调试模式 Chrome（端口 9222，独立 profile）
#
# 设计要点（与 launch-chrome.ps1 一致）：
# - 独立 user-data-dir（避免主 profile 占用导致 9222 被忽略）
# - --disable-blink-features=AutomationControlled 让 navigator.webdriver=false
# - 端口被占则复用已有实例（不重启）
#
# 使用：
#   bash job-crawler/scripts/launch-chrome.sh
# 启动后：在浏览器手动登录目标招聘平台（强烈建议小号）。

set -e

PORT=9222
PROFILE_DIR="$HOME/.job-crawler-chrome-profile"
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROMIUM_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium"
LINUX_CHROME=$(command -v google-chrome || command -v chromium || true)

BROWSER=""
if [ -x "$CHROME_PATH" ]; then
  BROWSER="$CHROME_PATH"
elif [ -x "$CHROMIUM_PATH" ]; then
  BROWSER="$CHROMIUM_PATH"
elif [ -n "$LINUX_CHROME" ]; then
  BROWSER="$LINUX_CHROME"
else
  echo "❌ 未找到 Chrome 或 Chromium，请先安装"
  exit 1
fi

# 已有实例则复用
if curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✅ 端口 $PORT 已有调试实例，直接复用："
  curl -s "http://127.0.0.1:$PORT/json/version"
  exit 0
fi

mkdir -p "$PROFILE_DIR"
"$BROWSER" \
  --remote-debugging-port=$PORT \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run --no-default-browser-check \
  --disable-blink-features=AutomationControlled \
  >/dev/null 2>&1 &

sleep 2
echo "✅ 调试浏览器已启动（端口 $PORT，独立 profile：$PROFILE_DIR）"
echo "👉 请在该浏览器中手动登录目标招聘平台（建议小号），然后回到 agent 执行 check_status"
