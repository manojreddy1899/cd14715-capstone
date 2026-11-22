import * as dotenv from 'dotenv';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import { promises as fs } from 'fs';
import { dirname } from 'path';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> [pr-number1] [pr-number2] [pr-number3]
 *
 * Example: npm run dev udacity cd14715-simple-todo-app 1 2 3
 * Or single PR: npm run dev facebook react 12345
 */
async function main() {
  const args = process.argv.slice(2);
  const [owner, repo, ...prNumbers] = args;

  // Validate command line arguments
  if (!owner || !repo || prNumbers.length === 0) {
    console.error('❌ Missing required arguments');
    console.error('Usage: npm run dev <owner> <repo> <pr-number> [pr-number2] [pr-number3] ...');
    console.error('Example: npm run dev udacity cd14715-simple-todo-app 1 2 3');
    console.error('Example: npm run dev facebook react 12345');
    process.exit(1);
  }

  // Validate PR numbers are positive integers
  const prs = prNumbers.map((prStr, idx) => {
    const prNumber = parseInt(prStr, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      console.error('❌ PR number must be a positive integer');
      console.error(`Argument ${idx + 3}: "${prStr}"`);
      process.exit(1);
    }
    return prNumber;
  });

  // Validate authentication setup
  const hasAnthropicAuth = process.env.ANTHROPIC_API_KEY;
  const hasAWSAuth = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  if (!hasAnthropicAuth && !hasAWSAuth) {
    console.error('❌ No authentication configured');
    console.error('Please set ONE of:');
    console.error('  Option 1: ANTHROPIC_API_KEY (for Anthropic API)');
    console.error('  Option 2: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (for AWS Bedrock)');
    process.exit(1);
  }

  // Validate model is configured
  if (!process.env.ANTHROPIC_MODEL) {
    console.error('❌ ANTHROPIC_MODEL environment variable not set');
    console.error('For Anthropic API: claude-opus-4-5-20251101');
    console.error('For AWS Bedrock: us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    process.exit(1);
  }

  // Log authentication method
  if (hasAWSAuth) {
    console.log('🔐 Using AWS Bedrock authentication');
    if (!process.env.AWS_REGION) {
      console.error('❌ AWS_REGION not set for Bedrock');
      process.exit(1);
    }
  } else {
    console.log('🔐 Using Anthropic API authentication');
  }

  console.log(`📝 Analyzing ${prs.length} PR(s) from ${owner}/${repo}`);

  try {
    // Create orchestrator instance
    const orchestrator = new CodeReviewOrchestrator({
      model: process.env.ANTHROPIC_MODEL,
      maxTurns: 10
    });

    // Create reports directory
    const reportsDir = './reports';
    await fs.mkdir(reportsDir, { recursive: true });

    // Generate formatted reports
    const generator = new ReportGenerator();

    // Process each PR
    for (let i = 0; i < prs.length; i++) {
      const prNumber = prs[i] as number;
      const prIndex = i + 1; // 1-indexed for file naming

      console.log(`\n📝 Analyzing PR ${prIndex}/${prs.length}: ${owner}/${repo} #${prNumber}`);

      try {
        // Run the review
        console.log('🚀 Starting multi-agent analysis...');
        const startTime = Date.now();
        const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);
        const duration = Date.now() - startTime;

        console.log(`✅ Analysis complete in ${duration}ms`);

        // Generate file names with index
        const baseFileName = `${owner}_${repo}_${prIndex}`;

        // Save JSON report
        const jsonReport = generator.generateJSONReport(report);
        const jsonPath = `${reportsDir}/${baseFileName}.json`;
        await fs.writeFile(jsonPath, jsonReport);
        console.log(`📄 Saved: ${jsonPath}`);

        // Save Markdown report
        const mdReport = generator.generateMarkdownReport(report);
        const mdPath = `${reportsDir}/${baseFileName}.md`;
        await fs.writeFile(mdPath, mdReport);
        console.log(`📄 Saved: ${mdPath}`);

        // Save HTML report
        const htmlReport = generator.generateHTMLReport(report);
        const htmlPath = `${reportsDir}/${baseFileName}.html`;
        await fs.writeFile(htmlPath, htmlReport);
        console.log(`📄 Saved: ${htmlPath}`);

        // Print summary
        console.log('\n📊 Review Summary:');
        console.log(`  Overall Score: ${report.summary.overallScore}/100`);
        console.log(`  Files Reviewed: ${report.summary.totalFiles}`);
        console.log(`  Critical Issues: ${report.summary.criticalIssues}`);
        console.log(`  Test Gaps: ${report.summary.highPriorityTests}`);
        console.log(`  Refactoring Opportunities: ${report.summary.refactoringOpportunities}`);
      } catch (prError) {
        console.error(`❌ Error analyzing PR #${prNumber}:`, prError instanceof Error ? prError.message : String(prError));
      }
    }

    console.log(`\n✅ All reports generated in ${reportsDir}/`);

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
