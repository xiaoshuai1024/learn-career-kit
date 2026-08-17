<#
.SYNOPSIS
  启动带远程调试端口的 Chrome/Edge,供 job-crawler 接管。
.DESCRIPTION
  - 优先 Chrome,本机无 Chrome 时 fallback Edge(Chromium 内核,CDP 同样支持)。
  - 强制使用独立 user-data-dir:若主 profile 已在运行,--remote-debugging-port 会被忽略
    (这是 Windows + Chrome 调试端口最常踩的坑)。
  - 默认端口 9222。多平台共用同一 profile(各平台 cookie 互不干扰)。
.NOTES
  启动后请在浏览器手动登录需登录的平台(boss=BOSS直聘 / liepin=猎聘,强烈建议小号);
  job51/zhilian 列表免登录。各平台 cookie 独立存于同一 profile。
#>
$ErrorActionPreference = 'Stop'

$port   = 9222
$profile = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\data\chrome-profile"))
New-Item -ItemType Directory -Force -Path $profile | Out-Null

# 启动时打开的平台首页(可按需增减;免登录平台打开也无妨)
$startUrls = @(
  "https://www.zhipin.com",
  "https://www.51job.com",
  "https://sou.zhaopin.com",
  "https://www.liepin.com"
)

# 探测浏览器:Chrome 优先,Edge 兜底
$candidates = @(
  "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
  "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:PROGRAMFILES(X86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:PROGRAMFILES\Microsoft\Edge\Application\msedge.exe"
)
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
  Write-Error "❌ 未找到 Chrome 或 Edge,请先安装其一。"
  exit 1
}

# 端口占用检测(可能浏览器已在调试模式运行)
$busy = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "⚠️  端口 $port 已被占用,可能浏览器已在调试模式运行,直接复用现有实例。" -ForegroundColor Yellow
  Write-Host "   验证地址: http://127.0.0.1:$port/json/version"
  exit 0
}

Write-Host "🚀 启动: $exe" -ForegroundColor Green
Write-Host "   调试端口: $port"
Write-Host "   独立 profile: $profile (与日常浏览器隔离,各平台 cookie 独立)" -ForegroundColor DarkGray
Write-Host "   打开平台: $($startUrls -join ' / ')"

$chromeArgs = @(
  "--remote-debugging-port=$port",
  "--user-data-dir=`"$profile`"",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-blink-features=AutomationControlled"
) + $startUrls
Start-Process $exe -ArgumentList $chromeArgs

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "✅ 浏览器已启动,已打开 4 个平台首页。" -ForegroundColor Green
Write-Host "   需登录的平台(BOSS直聘/猎聘)请在对应 tab 手动登录(建议小号);前程无忧/智联免登录。"
Write-Host "   登录后访问 http://127.0.0.1:$port/json/version,返回 JSON 即就绪。"
