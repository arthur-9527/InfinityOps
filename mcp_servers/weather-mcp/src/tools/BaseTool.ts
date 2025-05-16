import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export abstract class BaseToolImplementation {
  abstract name: string;
  abstract toolDefinition: Tool;
  abstract toolCall(
    request: z.infer<typeof CallToolRequestSchema>
  ): Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
} 