#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { z } from "zod";

// 创建 FastMCP 服务器实例
const server = new FastMCP({
  name: "Calculator MCP",
  version: "1.0.0",
  instructions: "一个简单的加减乘除计算器 MCP 服务器"
});

// 添加加法工具
server.addTool({
  name: "add",
  description: "将两个数字相加",
  parameters: z.object({
    a: z.number().describe("第一个数字"),
    b: z.number().describe("第二个数字"),
  }),
  execute: async (args) => {
    const result = args.a + args.b;
    return `${args.a} + ${args.b} = ${result}`;
  },
});

// 添加减法工具
server.addTool({
  name: "subtract",
  description: "将两个数字相减",
  parameters: z.object({
    a: z.number().describe("第一个数字"),
    b: z.number().describe("第二个数字"),
  }),
  execute: async (args) => {
    const result = args.a - args.b;
    return `${args.a} - ${args.b} = ${result}`;
  },
});

// 添加乘法工具
server.addTool({
  name: "multiply",
  description: "将两个数字相乘",
  parameters: z.object({
    a: z.number().describe("第一个数字"),
    b: z.number().describe("第二个数字"),
  }),
  execute: async (args) => {
    const result = args.a * args.b;
    return `${args.a} × ${args.b} = ${result}`;
  },
});

// 添加除法工具
server.addTool({
  name: "divide",
  description: "将两个数字相除",
  parameters: z.object({
    a: z.number().describe("被除数"),
    b: z.number().min(0.000001).describe("除数(不能为0)"),
  }),
  execute: async (args) => {
    const result = args.a / args.b;
    return `${args.a} ÷ ${args.b} = ${result}`;
  },
});

// 启动服务器
server.start({
  transportType: "stdio", // 使用标准输入/输出通信
});

console.error("Calculator MCP 服务器已启动"); 