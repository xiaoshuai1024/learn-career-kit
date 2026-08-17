#!/usr/bin/env node
/**
 * index.mjs — job-crawler 多平台 MCP server 入口(BOSS直聘 / 前程无忧 / 智联招聘 / 猎聘)
 *
 * 注册 4 工具(search_jobs / get_job_detail / export_to_md / check_status),
 * 经 StdioServerTransport 与 Claude Code 通信。所有抓取工具内部强制穿过 safety/ 防风控层。
 *
 * 只读红线:绝不投递 / 打招呼 / 沟通。只做"用户本可手动做的浏览"的自动化。
 */
process.title = 'job-crawler-mcp';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import * as searchJobs from './tools/search-jobs.mjs';
import * as getJobDetail from './tools/get-job-detail.mjs';
import * as exportToMd from './tools/export-to-md.mjs';
import * as checkStatus from './tools/check-status.mjs';

const TOOLS = [searchJobs, getJobDetail, exportToMd, checkStatus];

// Server name 保留 'boss-crawler',兼容现有 .claude/settings.json 的 MCP 配置标识
const server = new Server({ name: 'boss-crawler', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    inputSchema: t.definition.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!tool) return mcpText({ ok: false, error: `未知工具: ${name}` });
  try {
    const result = await tool.run(args || {});
    return mcpText(result);
  } catch (e) {
    return mcpText({ ok: false, error: e.message, code: e.code });
  }
});

function mcpText(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[job-crawler] 多平台 MCP server 已启动(stdio),平台:boss/job51/zhilian/liepin');
