# job-crawler — 多平台只读岗位爬虫 MCP Server

只读的多平台招聘岗位采集工具，以 MCP（Model Context Protocol，模型上下文协议）server 形式接入你的 AI agent（Codex / Claude Code / ZCode 等）。支持 BOSS直聘、猎聘、智联招聘、51Job 四大平台。采用 CDP（Chrome DevTools Protocol）接管**你手动登录**的浏览器，内置七层防风控。

> ⚠️ **本项目不提供也不绕过任何登录能力**：所有平台均需你自己手动登录，工具只读取已登录会话中的公开页面数据。

---

## ⚠️ 免责声明（务必阅读）

1. **仅供个人学习与研究用途**。本项目用于采集求职者本人求职决策所需的公开招聘信息，严禁用于商业用途、数据倒卖、批量爬取或任何违反目标平台服务条款的行为。
2. **遵守目标平台服务条款与当地法律法规**。各招聘平台的用户协议普遍限制自动化访问；使用本工具产生的任何账号风控（限流、封号）、法律风险或经济损失，由使用者自行承担。
3. **只读红线**。本工具绝不执行投递、打招呼、沟通、修改资料等写操作；验证码只暂停等待人工处理，绝不破解。
4. **数据权益归属**。抓取到的岗位数据版权归各平台及发布方所有，请仅用于个人参考，勿公开再分发。
5. **强建议使用小号**，并保持默认的保守抓取频率（`config/safety.json`）。

使用本工具即视为已阅读并同意以上条款。**作者不对滥用行为负责。**

---

## 工作原理

```
你手动登录的 Chrome (9222 调试端口)
        │  CDP 接管（Puppeteer connect，不自己起浏览器）
        ▼
job-crawler MCP server ──► 七层防风控
        │                   ① 域名白名单隔离  ② 节流间隔(默认≥8s)
        │                   ③ 每日上限         ④ 熔断(检测到风控页即停+冷却)
        │                   ⑤ 拟人化滚动/停留   ⑥ 审计日志(全量留痕)
        │                   ⑦ 时段限制
        ▼
你的 AI agent 通过 MCP 调用 4 个工具
```

## MCP 工具

| 工具 | 功能 |
|------|------|
| `check_status()` | 体检：连接/登录态/防风控状态 |
| `search_jobs({keyword, city, limit})` | 抓岗位列表（灰度模式默认 limit=5） |
| `get_job_detail({jobUrl})` | 抓单个岗位详情 |
| `export_to_md({direction})` | 把最近一次抓取结果写回 `docs/岗位列表.md`（自动去重；文件不存在时用模板初始化） |

## 快速开始

### 1. 安装

```bash
cd job-crawler
pnpm install        # 或 npm install
```

### 2. 启动调试浏览器（独立 profile + 9222 端口）

```bash
# macOS / Linux
bash scripts/launch-chrome.sh

# Windows (PowerShell)
pwsh scripts/launch-chrome.ps1
```

在打开的浏览器中**手动登录**你要用的招聘平台（强烈建议小号）。

### 3. 注册 MCP server（以你的 agent 文档为准）

```json
{
  "mcpServers": {
    "boss-crawler": {
      "command": "node",
      "args": ["/path/to/learn-career-kit/job-crawler/src/index.mjs"]
    }
  }
}
```

### 4. 在 agent 中使用

```
check_status 看下登录态
搜一下青岛的前端岗位，先抓 5 条
把刚才抓的岗位写进岗位列表
```

## 配置

| 文件 | 作用 |
|------|------|
| `config/defaults.json` | 默认城市/薪资/方向（可改成你所在城市） |
| `config/safety.json` | 防风控参数（间隔/上限/冷却/时段）——**调频率只动它** |
| `config/selectors.json` | 各平台 DOM 选择器（平台改版时维护） |
| `config/user-filters.json` | 入库过滤规则 |

## 目录结构

```
src/
  index.mjs            MCP server 入口（注册 4 工具）
  browser.mjs          CDP 连接接管
  platforms/           4 个平台适配器（boss/liepin/zhilian/job51）
  safety/              七层防风控（throttle/circuit-breaker/humanize/audit-log/guard/state-io）
  tools/               4 个 MCP 工具实现
  writer.mjs           写回 docs/岗位列表.md（两层去重 + 模板初始化）
config/                运行时配置
scripts/               调试浏览器启动脚本
```

## 红线（再次强调）

- 只读，绝不投递/打招呼/沟通
- 验证码只暂停等人手动过，不破解
- 强制独立 user-data-dir，建议小号
- 遇到风控提示立即熔断冷却，勿手动调小 `safety.json` 的间隔
