/**
 * Model Context Protocol (MCP) server configurations
 *
 * Required MCP Servers:
 * 1. GitHub - For PR/repo operations
 * 2. ESLint - For code linting and style analysis
 *
 * Documentation:
 * - MCP Protocol: https://modelcontextprotocol.io
 * - GitHub MCP: https://github.com/github/github-mcp-server
 * - ESLint MCP: https://eslint.org/docs/latest/use/mcp
 */

export const mcpServersConfig = {
  /**
   * GitHub MCP Server
   * Provides tools for GitHub API operations
   *
   * Configuration:
   * - type: 'stdio' as const - Uses stdio for process communication
   * - command: 'npx' - npm package executor to run packages without installation
   * - args: ['-y', '@modelcontextprotocol/server-github'] - Run GitHub MCP server with auto-yes
   * - env: Maps GITHUB_TOKEN from .env to GITHUB_PERSONAL_ACCESS_TOKEN expected by the server
   *
   * Note: GITHUB_TOKEN is optional (recommended for private repos and higher rate limits).
   * The GitHub MCP server expects GITHUB_PERSONAL_ACCESS_TOKEN as the env var name.
   * We map our GITHUB_TOKEN from .env to this expected name.
   */
  github: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || ''
    }
  },

  /**
   * ESLint MCP Server
   * Provides tools for linting and code quality analysis
   *
   * Configuration:
   * - type: 'stdio' as const - Uses stdio for process communication
   * - command: 'npx' - npm package executor
   * - args: ['-y', '@eslint/mcp@latest'] - Run ESLint MCP server with auto-yes
   * - env: {} - No authentication required
   */
  eslint: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@eslint/mcp@latest'],
    env: {}
  }
};
