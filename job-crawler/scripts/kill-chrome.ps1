<#
.SYNOPSIS
  关闭 job-crawler 调试浏览器(Chrome/Edge)，用于重启或紧急停止。
.DESCRIPTION
  默认只关闭占用调试端口 9222 的进程，**不影响日常使用的浏览器**。
  支持优雅关闭(Win32 API SendMessage WM_CLOSE)和强制终止(taskkill)两级策略。
.PARAMETER Force
  跳过优雅关闭，直接强制终止。
.PARAMETER All
  **⚠️ 危险** — 关闭本用户所有 Chrome/Edge 实例(包括日常浏览器！)
  仅在调试端口失效或浏览器全部卡死时使用。
.PARAMETER Port
  指定调试端口(默认 9222)。
.EXAMPLE
  pwsh job-crawler/scripts/kill-chrome.ps1
  优雅关闭调试浏览器(**不影响日常Chrome**)。

.EXAMPLE
  pwsh job-crawler/scripts/kill-chrome.ps1 -Force
  强制终止调试浏览器进程。

.EXAMPLE
  pwsh job-crawler/scripts/kill-chrome.ps1 -All -Force
  ⚠️ 强制终止本用户全部 Chrome/Edge(包括日常！)

.NOTES
  使用场景:
  1. 爬虫空白页 → 需重启浏览器加载反检测参数
  2. BOSS session 风控 → 重启清 CDP 连接痕迹
  3. 浏览器卡死 → 紧急恢复
  关联: launch-chrome.ps1(启动) / _boss-deep.mjs(BOSS专项)
#>

[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$All
)

$ErrorActionPreference = 'Continue'
$port = 9222

# ====== 策略1: 按命令行特征找调试实例(端口 $port) ======
# 用 Win32_Process 命令行匹配 chrome.exe/msedge.exe + remote-debugging-port=$port,
# 比 Get-NetTCPConnection 可靠:后者在 Edge 某些监听形态(IPv6/loopback/状态过滤)下返回空,
# 导致漏杀主进程 → 端口不释放 → launch 报端口占用。
# 同时覆盖 Chrome 与 Edge(launch-chrome.ps1 无 Chrome 时回退 Edge)。
function Get-BrowserByPort {
  $matched = Get-CimInstance Win32_Process -Filter "name='chrome.exe' OR name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*remote-debugging-port=$port*" }
  if (!$matched) { return $null }
  $procs = $matched | ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } | Where-Object { $_ }
  return $procs
}

function Close-Gracefully {
  param($proc)
  $name = $proc.ProcessName
  Write-Host "优雅关闭 $name (PID:$($proc.Id))..." -ForegroundColor Yellow
  try {
    # Send WM_CLOSE to main window
    $proc.CloseMainWindow() | Out-Null
    $proc.WaitForExit(5000) | Out-Null
    if (!$proc.HasExited) {
      Write-Host "  未响应,等待额外 3s..." -ForegroundColor DarkGray
      $proc.WaitForExit(3000) | Out-Null
    }
    if ($proc.HasExited) {
      Write-Host "  ✅ $name 已关闭" -ForegroundColor Green
      return $true
    }
  } catch {}
  return $false
}

function Kill-Force {
  param($proc)
  $name = $proc.ProcessName
  Write-Host "强制终止 $name (PID:$($proc.Id))..." -ForegroundColor Magenta
  try {
    # taskkill /T 杀整个进程树:调试实例的子进程(renderer/GPU)一并清掉,确保端口释放
    taskkill /PID $proc.Id /T /F 2>$null | Out-Null
    $proc.WaitForExit(3000) | Out-Null
    if ($proc.HasExited) {
      Write-Host "  ✅ $name 已终止(进程树)" -ForegroundColor Green
      return $true
    }
    # fallback: .NET Process.Kill
    $proc.Kill()
    $proc.WaitForExit(3000)
    Write-Host "  ✅ $name 已终止(.NET)" -ForegroundColor Green
    return $true
  } catch {
    return $false
  }
}

function Close-AllBrowsers {
  param([bool]$forceMode)
  $names = @('chrome', 'msedge')
  $all = Get-Process -Name $names -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID }
  if (!$all) {
    Write-Host "  未找到运行中的 Chrome/Edge 进程" -ForegroundColor DarkGray
    return
  }
  Write-Host "找到 $($all.Count) 个浏览器进程:" -ForegroundColor Yellow
  $all | ForEach-Object { Write-Host "    $($_.ProcessName) PID:$($_.Id) 内存:$([math]::Round($_.WorkingSet64/1MB,0))MB" -ForegroundColor DarkGray }

  $closed = 0
  foreach ($proc in $all) {
    if ($forceMode) {
      if (Kill-Force $proc) { $closed++ }
    } else {
      if (Close-Gracefully $proc) { $closed++ }
      else {
        Write-Host "    ⚠️ 优雅关闭失败,尝试强制..." -ForegroundColor Yellow
        if (Kill-Force $proc) { $closed++ }
      }
    }
  }
  Write-Host "已关闭: $closed / $($all.Count)" -ForegroundColor Cyan
}

# ====== 主流程 ======
Write-Host ""
Write-Host "🗑️  job-crawler 浏览器关闭工具" -ForegroundColor Cyan
Write-Host "   模式: $(if($Force){'强制'}else{'优雅优先'}) | 范围: $(if($All){'全部'}else{'调试端口'})" -ForegroundColor DarkGray
Write-Host ""

if ($All) {
  # 关闭全部 Chrome/Edge 实例
  Close-AllBrowsers $Force
} else {
  # 只关闭调试端口 9222 的进程(按命令行特征,覆盖 Chrome+Edge)
  $procs = Get-BrowserByPort
  if (!$procs) {
    Write-Host "⚠️  未找到命令行带 remote-debugging-port=$port 的浏览器进程" -ForegroundColor Yellow
    Write-Host "   可能已关闭,或调试端口不是 $port" -ForegroundColor DarkGray
    # 列出当前所有浏览器进程供参考
    $allBrowsers = Get-Process -Name @('chrome','msedge') -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID }
    if ($allBrowsers) {
      Write-Host ""
      Write-Host "当前浏览器进程:" -ForegroundColor DarkGray
      $allBrowsers | ForEach-Object { Write-Host "    $($_.ProcessName) PID:$($_.Id)" -ForegroundColor DarkGray }
      Write-Host "   (如需关闭全部请加 -All 参数)" -ForegroundColor DarkGray
    }
    exit 0
  }

  $procList = @($procs)  # 归一成数组(单个 Process 也包成数组遍历)
  Write-Host "找到调试浏览器 $($procList.Count) 个进程 (端口 $port):" -ForegroundColor Cyan
  $procList | ForEach-Object { Write-Host "    $($_.ProcessName) PID:$($_.Id)" -ForegroundColor DarkGray }

  $closed = 0
  foreach ($proc in $procList) {
    if ($Force) {
      if (Kill-Force $proc) { $closed++ }
    } else {
      if (-not (Close-Gracefully $proc)) {
        Write-Host "  ⚠️ 优雅关闭失败,强制终止..." -ForegroundColor Yellow
        if (Kill-Force $proc) { $closed++ }
      } else { $closed++ }
    }
  }
  Write-Host "已处理: $closed / $($procList.Count)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "✅ 完成。重新启动请运行: pwsh job-crawler/scripts/launch-chrome.ps1" -ForegroundColor Green
Write-Host ""
