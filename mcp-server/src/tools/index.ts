import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { registerAddKnowledge } from "./add-knowledge.js";
import { registerConfirmKnowledge } from "./confirm-knowledge.js";
import { registerListKnowledge } from "./list-knowledge.js";
import { registerSaveQuiz } from "./save-quiz.js";
import { registerGetTagStats } from "./get-tag-stats.js";

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerAddKnowledge(server, ctx);
  registerConfirmKnowledge(server, ctx);
  registerListKnowledge(server, ctx);
  registerSaveQuiz(server, ctx);
  registerGetTagStats(server, ctx);
}
