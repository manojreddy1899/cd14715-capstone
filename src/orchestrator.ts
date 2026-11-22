import { query, AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ReviewReport, ReviewReportSchema } from './types/report-types.js';
import { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester } from './agents/index.js';
import { buildOrchestratorPrompt } from './prompts/index.js';
import { mcpServersConfig } from './config/mcp.config.js';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 *
 * This orchestrator:
 * 1. Uses Claude Agent SDK to coordinate three specialized subagents
 * 2. Fetches PR data via GitHub MCP server
 * 3. Spawns subagents in parallel for each file (using Task tool)
 * 4. Aggregates results into structured ReviewReport
 * 5. Validates output with Zod schema
 */
export class CodeReviewOrchestrator {
  private model: string;
  private maxTurns: number;

  constructor(options: OrchestratorOptions = {}) {
    this.model = options.model || process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101';
    this.maxTurns = options.maxTurns || 10;
  }

  /**
   * Async generator for streaming messages
   */
  private async *generateMessages(userMessage: string) {
    yield {
      type: 'user' as const,
      message: { role: 'user' as const, content: userMessage },
      parent_tool_use_id: null,
      session_id: 'code-review-orchestrator-session'
    };
  }

  /**
   * Review a pull request using parallel subagent analysis
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Complete review report
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    // Convert Zod schema to JSON Schema for SDK structured outputs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewReportJsonSchema = zodToJsonSchema(ReviewReportSchema as any, {
      $refStrategy: 'root'
    }) as Record<string, unknown>;

    // Build the orchestrator prompt for this specific PR
    const orchestratorPrompt = buildOrchestratorPrompt(owner, repo, prNumber);

    // Create agents map for subagent references
    const agents: Record<string, AgentDefinition> = {
      'code-quality-analyzer': codeQualityAnalyzer as AgentDefinition,
      'test-coverage-analyzer': testCoverageAnalyzer as AgentDefinition,
      'refactoring-suggester': refactoringSuggester as AgentDefinition
    };

    // Execute the orchestrator query with all three subagents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const message of query({
      prompt: this.generateMessages(orchestratorPrompt),
      options: {
        model: this.model,
        agents,
        mcpServers: mcpServersConfig as any,
        allowedTools: ['Task', 'mcp__github__*'],
        outputFormat: {
          type: 'json_schema',
          schema: reviewReportJsonSchema
        },
        maxTurns: this.maxTurns
      }
    })) {
      // Handle MCP server initialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((message as any).type === 'system' && (message as any).subtype === 'init') {
        const initMessage = message as unknown as { mcpServers?: Record<string, { status: string; error?: string }> };
        if (initMessage.mcpServers) {
          for (const [name, server] of Object.entries(initMessage.mcpServers)) {
            if (server.status === 'failed') {
              console.error(`⚠️ MCP server '${name}' failed to connect: ${server.error || 'Unknown error'}`);
            }
          }
        }
      }

      // Handle structured output result
      if (message.type === 'result') {
        if (message.subtype === 'success' && message.structured_output) {
          const finalReport = message.structured_output as ReviewReport;
          // Validate with Zod schema to ensure correctness
          const validatedReport = ReviewReportSchema.parse(finalReport);
          return validatedReport;
        } else if (message.subtype !== 'success') {
          throw new Error(`Orchestrator failed: ${message.subtype}`);
        }
      }
    }

    throw new Error('Orchestrator failed to generate a review report');
  }
}
