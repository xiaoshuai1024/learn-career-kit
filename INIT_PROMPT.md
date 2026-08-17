# INIT_PROMPT.md — 给 AI Agent 的一句话初始化提示词

在 Claude Code / Codex 等支持 `AGENTS.md` 的 Agent 工具中，进入本仓库目录后发送以下内容：

```text
我已经把 learn-career-kit 这个学习闭环框架 clone 到本地了，请先读根目录的 AGENTS.md 和 docs/SPEC.md 理解项目结构，
然后帮我完成初始化：把 docs/templates/ 下的示例工作文件复制到 docs/，把 docs/能力评估数据.json 中的张三示例数据
替换为我的信息（待会儿我会口述），配置好岗位爬虫 MCP（job-crawler/，含免责声明确认），最后跑一遍 make report
验证闭环可用，并告诉我接下来该说什么来启动第一次能力评估。
```

Agent 会依次执行：

1. 读 `AGENTS.md`（文档职责矩阵 / 数据流向 / 学习材料粒度规范）与 `docs/SPEC.md`（产品设计）
2. 从 `docs/templates/` 初始化工作文件（生词本 / 错题本 / 学习记录 / 技术学习清单 / 每日学习日志 / 岗位列表）
3. 采集你的个人信息与目标岗位，改写 `docs/能力评估数据.json`（清空示例 snapshots，重新积累）
4. 注册 `job-crawler` MCP（需先确认你已阅读 job-crawler/README.md 的免责声明）
5. `make report` + `make gap` 验证闭环，展示雷达图与差距矩阵

之后你只需用自然语言对话即可（如「测一下我的后端水平」「帮我学最薄弱的点」），详见 README 的「自然语言用法」一节。
