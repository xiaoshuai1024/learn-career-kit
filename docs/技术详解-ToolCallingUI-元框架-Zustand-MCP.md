# 技术详解 — Tool Calling UI / MCP / Zustand / 元框架

> 来源：掘金、知乎、CSDN、官方文档，2026-06-13 整理

---

## 一、Tool Calling UI（AI 交互前端）

### 1.1 是什么

Tool Calling UI 是 AI 对话界面中展示"模型调用了外部工具"的交互组件。当大模型通过 Function Calling 调用搜索、数据库查询、代码执行等工具时，前端需要将这个过程可视化展示给用户。

### 1.2 为什么重要

2026 年 AI 应用开发的共识：**Agent 不是纯对话，而是"对话 + 工具调用"的混合模式**。前端必须能展示：
- 模型正在调用什么工具
- 工具的执行状态（等待 → 执行中 → 完成 → 报错）
- 工具返回的结果
- 用户审批确认（某些危险操作需要用户确认）

### 1.3 核心实现

#### 数据结构设计

```typescript
// 工具调用的消息结构
interface ToolCallMessage {
  id: string
  type: 'tool_call'
  toolName: string        // 工具名称，如 "web_search"
  toolInput: Record<string, any>  // 工具输入参数
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: any            // 工具返回结果
  error?: string          // 错误信息
  startTime: number
  endTime?: number
}

// 对话消息结构
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCallMessage[]  // assistant 消息可附带多个工具调用
}
```

#### SSE 流式接收 Tool Calling 事件

```typescript
// 后端 SSE 事件类型
type SSEEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_call_args'; toolCallId: string; args: string }
  | { type: 'tool_call_end'; toolCallId: string; result: any }
  | { type: 'message_end' }

// 前端解析 SSE 流
async function handleSSEStream(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 解析 SSE 格式：data: {...}\n\n
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const data = line.replace(/^data: /, '')
      if (data === '[DONE]') return

      const event: SSEEvent = JSON.parse(data)

      switch (event.type) {
        case 'text_delta':
          appendAssistantText(event.content)
          break
        case 'tool_call_start':
          addToolCallCard(event.toolCallId, event.toolName)
          break
        case 'tool_call_args':
          updateToolCallArgs(event.toolCallId, event.args)
          break
        case 'tool_call_end':
          updateToolCallResult(event.toolCallId, event.result)
          break
      }
    }
  }
}
```

#### Tool Calling 卡片 UI

```tsx
function ToolCallCard({ toolCall }: { toolCall: ToolCallMessage }) {
  const statusConfig = {
    pending:   { icon: '⏳', text: '等待执行', color: 'gray' },
    running:   { icon: '⚙️', text: '执行中...', color: 'blue' },
    completed: { icon: '✅', text: '已完成', color: 'green' },
    error:     { icon: '❌', text: '执行失败', color: 'red' },
  }

  const config = statusConfig[toolCall.status]

  return (
    <div className={`tool-call-card border-${config.color}`}>
      <div className="tool-call-header">
        <span>{config.icon}</span>
        <span className="tool-name">{toolCall.toolName}</span>
        <span className="status">{config.text}</span>
        {toolCall.endTime && (
          <span className="duration">
            耗时 {(toolCall.endTime - toolCall.startTime) / 1000}s
          </span>
        )}
      </div>

      {/* 可折叠的输入参数 */}
      <details>
        <summary>输入参数</summary>
        <pre>{JSON.stringify(toolCall.toolInput, null, 2)}</pre>
      </details>

      {/* 执行结果 */}
      {toolCall.status === 'completed' && toolCall.result && (
        <details open>
          <summary>执行结果</summary>
          <pre>{JSON.stringify(toolCall.result, null, 2)}</pre>
        </details>
      )}

      {/* 错误信息 */}
      {toolCall.error && (
        <div className="error-msg">{toolCall.error}</div>
      )}
    </div>
  )
}
```

#### 用户审批交互

```tsx
function ApprovalCard({ toolCall, onApprove, onReject }) {
  return (
    <div className="approval-card">
      <p>AI 请求执行以下操作：</p>
      <pre>{JSON.stringify(toolCall.toolInput, null, 2)}</pre>
      <div className="approval-actions">
        <button onClick={() => onApprove(toolCall.id)}>✅ 允许执行</button>
        <button onClick={() => onReject(toolCall.id)}>❌ 拒绝</button>
      </div>
    </div>
  )
}
```

### 1.4 面试要点

| 问题 | 答案要点 |
|------|----------|
| Tool Calling UI 如何处理多个工具并行调用？ | SSE 流中每个 tool_call 有独立 ID，前端用 Map 存储状态，并行更新 |
| 如何处理流式传输中 JSON 片段解析？ | 累积 buffer，遇到完整 JSON 才解析；使用 `JSON.parse` 的 reviver 处理 |
| 工具执行超时怎么处理？ | 前端设 setTimeout，超时后标记为 error；后端也要有超时机制 |
| 工具调用和文本内容如何交替渲染？ | 消息体维护一个有序列表，按 SSE 事件顺序插入文本段和工具卡片 |

---

## 二、MCP 协议（Model Context Protocol）

### 2.1 是什么

MCP 是 Anthropic（Claude 的公司）在 2024 年底发布的开放协议，目的是**标准化 AI 模型与外部工具/数据源的交互方式**。

类比理解：
- **USB-C** 统一了硬件接口 → **MCP** 统一了 AI 工具接口
- 以前每个 AI 应用都要为每个工具写专属适配代码，现在所有工具只要实现 MCP 协议就能被任何 AI 应用调用

### 2.2 核心概念

```
┌─────────────────────────────────────────────┐
│                 MCP 架构                      │
│                                              │
│  MCP Host（宿主应用）                         │
│  ├── Claude Desktop / Cursor / Copilot       │
│  └── 你的 AI 应用                             │
│       │                                      │
│       │  MCP 协议（JSON-RPC 2.0）             │
│       │                                      │
│  MCP Client（客户端）                         │
│  └── 内嵌在 Host 中，管理连接                  │
│       │                                      │
│       │  stdio / SSE 传输                     │
│       │                                      │
│  MCP Server（服务端）                         │
│  ├── 暴露 3 类能力：                          │
│  │   ├── Tools（工具）    → 可执行的函数       │
│  │   ├── Resources（资源）→ 可读取的数据       │
│  │   └── Prompts（提示词）→ 预定义的提示模板   │
│  └── 每个 Server 独立进程运行                  │
└─────────────────────────────────────────────┘
```

### 2.3 三个核心能力

#### Tools（工具）

```typescript
// MCP Server 暴露一个工具
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "query_database",
    description: "查询数据库",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL 查询语句" },
      },
      required: ["sql"]
    }
  }]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "query_database") {
    const result = await db.query(request.params.arguments.sql)
    return { content: [{ type: "text", text: JSON.stringify(result) }] }
  }
})
```

#### Resources（资源）

```typescript
// 暴露可读取的资源（文件、数据等）
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [{
    uri: "docs://api-reference",
    name: "API 参考文档",
    mimeType: "text/markdown"
  }]
}))
```

#### Prompts（提示模板）

```typescript
// 暴露预定义的提示模板
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [{
    name: "code-review",
    description: "代码审查助手",
    arguments: [{ name: "code", description: "要审查的代码" }]
  }]
}))
```

### 2.4 MCP vs Function Calling 区别

| 维度 | Function Calling | MCP |
|------|-----------------|-----|
| 定义方 | 各模型厂商自定义 | Anthropic 制定开放标准 |
| 兼容性 | 绑定特定模型 | 模型无关，任何 AI 应用都能用 |
| 工具注册 | 代码中硬编码 | Server 独立部署，动态发现 |
| 安全性 | 无标准机制 | 支持 sampling（人类审批） |
| 生态 | 各自为战 | 统一市场，即插即用 |
| 适用场景 | 简单的 API 调用 | 复杂的工具编排、企业级集成 |

### 2.5 实战：创建一个 MCP Server（TypeScript）

```bash
# 初始化
npm init -y
npm install @modelcontextprotocol/sdk

# 创建 server
```

```typescript
// server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: "my-tools",
  version: "1.0.0"
})

// 注册一个工具
server.tool(
  "search_docs",
  "搜索项目文档",
  { query: z.string().describe("搜索关键词") },
  async ({ query }) => {
    const results = await searchDocs(query)
    return {
      content: [{ type: "text", text: JSON.stringify(results) }]
    }
  }
)

// 启动
const transport = new StdioServerTransport()
await server.connect(transport)
```

### 2.6 面试要点

| 问题 | 答案要点 |
|------|----------|
| MCP 解决了什么问题？ | AI 应用接入工具的标准化，一次开发到处可用 |
| MCP Server 怎么和 AI 应用通信？ | stdio（本地）或 SSE（远程），基于 JSON-RPC 2.0 |
| MCP 和 LangChain 的关系？ | LangChain 是编排框架，MCP 是工具协议。LangChain 可以调用 MCP Server |
| 海尔为什么点名要 MCP？ | 企业级 Agent 需要标准化工具接入，MCP 是当前最被认可的协议标准 |

---

## 三、Zustand（React 状态管理）

### 3.1 是什么

Zustand 是一个极简的 React 状态管理库。名字来自德语"状态"（Zustand），读音类似"租-施坦特"。

核心理念：**用最少的代码做状态管理，没有 Provider、没有 reducer、没有模板代码。**

### 3.2 为什么选 Zustand（对比 Redux）

| 维度 | Redux | Zustand |
|------|-------|---------|
| 代码量 | reducer + action + dispatch + slice | 一个 create 函数 |
| 学习成本 | 高（中间件、thunk、saga） | 低（会 React hooks 就会） |
| Provider | 需要 `<Provider>` 包裹 | 不需要 |
| 性能 | 全局更新（需 selector 优化） | 自动 selector 优化 |
| TypeScript | 需要大量类型定义 | 原生 TS 支持 |
| 包体积 | ~7KB | ~1KB |
| 适用场景 | 大型团队、需要严格规范 | 中小型项目、快速迭代 |

### 3.3 基础用法

```typescript
// store/chatStore.ts
import { create } from 'zustand'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
}

interface ChatStore {
  messages: ChatMessage[]
  isLoading: boolean
  addMessage: (msg: ChatMessage) => void
  updateLastMessage: (content: string) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

const useChatStore = create<ChatStore>((set) => ({
  // state
  messages: [],
  isLoading: false,

  // actions
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, msg]
  })),

  updateLastMessage: (content) => set((state) => {
    const messages = [...state.messages]
    const last = messages[messages.length - 1]
    if (last) {
      messages[messages.length - 1] = { ...last, content: last.content + content }
    }
    return { messages }
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  clearMessages: () => set({ messages: [] }),
}))

export default useChatStore
```

```tsx
// 在组件中使用 — 无需 Provider
function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoading)
  const addMessage = useChatStore((s) => s.addMessage)

  return (
    <div>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && <Spinner />}
    </div>
  )
}
```

### 3.4 异步操作（AI 场景）

```typescript
// 不需要 thunk/saga，直接写 async
const useChatStore = create<ChatStore>((set, get) => ({
  // ...省略 state 和同步 action

  sendUserMessage: async (content: string) => {
    const { addMessage, setLoading, updateLastMessage } = get()

    // 1. 添加用户消息
    addMessage({ id: genId(), role: 'user', content })

    // 2. 添加空的 assistant 消息（准备流式填充）
    const assistantId = genId()
    addMessage({ id: assistantId, role: 'assistant', content: '' })
    setLoading(true)

    // 3. 调用后端 SSE 接口
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: get().messages }),
    })

    // 4. 流式读取
    await handleSSEStream(response, (delta) => {
      updateLastMessage(delta)  // 逐字追加
    })

    setLoading(false)
  },
}))
```

### 3.5 持久化（localStorage）

```typescript
import { persist } from 'zustand/middleware'

const useChatStore = create(
  persist<ChatStore>(
    (set) => ({
      messages: [],
      // ...
    }),
    {
      name: 'chat-storage',        // localStorage key
      partialize: (state) => ({     // 只持久化部分字段
        messages: state.messages,
      }),
    }
  )
)
```

### 3.6 面试要点

| 问题 | 答案要点 |
|------|----------|
| Zustand 和 Redux 的区别？ | 无 Provider、无 reducer、1KB、自动 selector |
| Zustand 怎么避免不必要的 re-render？ | `(s) => s.messages` 自动做浅比较，只有 messages 变了才重渲染 |
| Zustand 支持中间件吗？ | 支持，常用 persist（持久化）、immer（不可变更新）、devtools |
| AI 对话场景为什么要用 Zustand？ | 流式更新频繁，Zustand 的细粒度 selector 避免全组件树重渲染 |

---

## 四、元框架（Next.js / Nuxt.js）

### 4.1 是什么

元框架（Meta Framework）是基于底层框架（React/Vue）的全栈增强框架，提供：
- 服务端渲染（SSR）
- 静态生成（SSG）
- API 路由（后端接口）
- 文件路由
- 自动代码分割

**类比：** React/Vue 是"发动机"，Next.js/Nuxt.js 是"整车"。

### 4.2 两大元框架对比

| 维度 | Next.js（React 系） | Nuxt.js（Vue 系） |
|------|---------------------|-------------------|
| 底层框架 | React | Vue |
| 渲染模式 | SSR / SSG / ISR / CSR / RSC | SSR / SSG / ISR / CSR / Nuxt Hybriding |
| 路由 | App Router（文件系统） | Pages / App Router |
| API 路由 | Route Handlers | Server Routes |
| 部署 | Vercel（推荐）/ 自托管 | Vercel / Node / Deno / Cloudflare |
| 学习曲线 | 中高（RSC 概念新） | 中（Vue 上手快） |
| 生态规模 | 最大（npm 下载量 React 系第一） | 中（Vue 系第一） |
| 青岛市场 | 大厂高级岗 React 多 | 中小企业 Vue 多 |
| 推荐版本 | Next.js 15 | Nuxt 4 |

### 4.3 Next.js 15 核心概念

#### App Router（文件路由）

```
app/
├── layout.tsx          # 根布局（所有页面共享）
├── page.tsx            # 首页
├── about/
│   └── page.tsx        # /about 页面
├── blog/
│   ├── page.tsx        # /blog 列表页
│   └── [slug]/
│       └── page.tsx    # /blog/xxx 文章页（动态路由）
└── api/
    └── chat/
        └── route.ts    # /api/chat 后端接口
```

#### Server Components vs Client Components

```tsx
// 默认是 Server Component（服务端执行，不发 JS 到客户端）
// app/page.tsx
async function HomePage() {
  const data = await fetch('https://api.example.com/posts')
  const posts = await data.json()

  return <PostList posts={posts} />
}

// 加 'use client' 变成 Client Component（客户端执行）
'use client'
import { useState } from 'react'

function ChatInput() {
  const [input, setInput] = useState('')
  // ...AI 对话逻辑
  return <input value={input} onChange={(e) => setInput(e.target.value)} />
}
```

#### API Route（SSE 流式接口）

```typescript
// app/api/chat/route.ts
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // 调用大模型 API（流式）
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages,
          stream: true,
        }),
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        // 转发 SSE 格式
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

### 4.4 Nuxt 4 核心概念

```typescript
// server/api/chat.ts — Nuxt API Route
export default defineEventHandler(async (event) => {
  const { messages } = await readBody(event)

  // Nuxt 内置了 SSE 支持
  const stream = createEventStream(event)

  // 调用大模型并流式推送
  const response = await callLLM(messages)
  for await (const chunk of response) {
    stream.push(chunk)
  }

  stream.close()
})
```

### 4.5 选型建议

| 场景 | 推荐 |
|------|------|
| 青岛大厂高级岗（海尔/聚好看） | Next.js（React 生态，架构岗要求） |
| 青岛中小企业（Vue 为主） | Nuxt.js（Vue 生态，上手快） |
| AI 全栈项目 | 两者均可，选你更熟的框架 |
| SEO 要求高 | 两者都支持 SSR/SSG |
| 面试准备 | **两个都了解原理，精通一个** |

### 4.6 面试要点

| 问题 | 答案要点 |
|------|----------|
| SSR vs CSR vs SSG 区别？ | SSR 服务端渲染（每次请求）、CSR 客户端渲染（SPA）、SSG 构建时生成静态页 |
| 什么是 RSC（React Server Components）？ | 服务端执行组件逻辑，不发 JS 到客户端，减少 bundle 体积 |
| 元框架的流式渲染怎么做？ | 后端 ReadableStream + SSE，前端 EventSource/fetch 读取 |
| Next.js App Router vs Pages Router？ | App Router 是新方案，支持 RSC、layout 嵌套、更灵活的渲染策略 |

---

> 来源：
> - 掘金《2026最新React技术栈梳理》/《RAG+Agent融合架构2026》
> - 51CTO《Nuxt与Next.js深度对比》
> - MCP 官方文档 modelcontextprotocol.io
> - Zustand 官方文档 github.com/pmndrs/zustand
> - InfoQ《前端框架新格局》
