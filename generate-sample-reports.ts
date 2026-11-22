/**
 * Generate sample reports for demonstration purposes
 * Creates 3 complete PR review reports with realistic data
 */

import { ReportGenerator } from './src/utils/report-generator.js';
import { ReviewReport } from './src/types/report-types.js';
import { promises as fs } from 'fs';
import { dirname } from 'path';

const generator = new ReportGenerator();

function generateSampleReport(prNumber: number): ReviewReport {
  const files = [
    'src/index.ts',
    'src/utils/todo.ts',
    'tests/todo.test.ts'
  ];

  return {
    pullRequest: {
      owner: 'udacity',
      repo: 'cd14715-simple-todo-app',
      number: prNumber
    },
    fileReviews: files.map((file, idx) => ({
      file,
      codeQuality: {
        file,
        issues: [
          {
            line: 10 + idx * 5,
            severity: idx === 0 ? 'high' : 'medium',
            category: 'security',
            description: `Potential ${idx === 0 ? 'SQL injection' : 'type safety'} issue in file`,
            suggestion: `Use parameterized queries and proper validation`
          },
          {
            line: 25 + idx * 5,
            severity: 'low',
            category: 'style',
            description: 'Missing error handling',
            suggestion: 'Add try-catch block'
          }
        ],
        overallScore: 75 + idx * 5,
        summary: `File has ${2} issues and adequate structure`
      },
      testCoverage: {
        file,
        hasTests: idx < 2,
        testFiles: idx < 2 ? [`tests/${file.split('/')[1]}test.ts`] : [],
        untestedPaths: [
          {
            type: 'function',
            location: `function_${idx}_1`,
            priority: 'high',
            reasoning: 'Edge case handling not tested',
            suggestedTest: `test('should handle empty input', () => { ... })`
          },
          {
            type: 'branch',
            location: `line ${35 + idx * 10}`,
            priority: 'medium',
            reasoning: 'Error path not covered',
            suggestedTest: `test('should throw on invalid data', () => { ... })`
          }
        ],
        coverageEstimate: 65 + idx * 10,
        summary: `Estimated ${65 + idx * 10}% coverage with ${2} untested paths`
      },
      refactorings: {
        file,
        suggestions: [
          {
            type: 'extract-function',
            location: `lines ${15 + idx * 20}-${30 + idx * 20}`,
            impact: 'high',
            description: 'Large function should be split',
            before: 'function validateAndSave(data) { ... 50 lines ... }',
            after: 'const validate = (data) => {...}\nconst save = (data) => {...}',
            benefits: 'Improved testability and reusability'
          },
          {
            type: 'modernize',
            location: `line ${40 + idx * 15}`,
            impact: 'medium',
            description: 'Use modern async/await pattern',
            before: 'promise.then().catch()',
            after: 'try { await promise; } catch (e) {}',
            benefits: 'Better error handling and readability'
          }
        ],
        summary: `${2} refactoring opportunities found`
      }
    })),
    summary: {
      totalFiles: files.length,
      overallScore: 72 + (prNumber - 1) * 2,
      criticalIssues: 1 + (prNumber - 1),
      highPriorityTests: 2 + (prNumber - 1),
      refactoringOpportunities: files.length * 2
    },
    recommendations: [
      {
        priority: 'critical',
        category: 'Security',
        description: 'Address SQL injection vulnerability in authentication module',
        files: ['src/index.ts']
      },
      {
        priority: 'high',
        category: 'Testing',
        description: 'Add integration tests for data persistence',
        files: ['src/utils/todo.ts', 'tests/todo.test.ts']
      },
      {
        priority: 'medium',
        category: 'Performance',
        description: 'Consider caching strategy for frequently accessed data',
        files: ['src/index.ts', 'src/utils/todo.ts']
      },
      {
        priority: 'low',
        category: 'Code Quality',
        description: 'Add JSDoc comments for public API',
        files: ['src/index.ts', 'src/utils/todo.ts']
      }
    ],
    metadata: {
      analyzedAt: new Date().toISOString(),
      duration: 5000 + prNumber * 1000,
      agentVersions: {
        orchestrator: '1.0',
        'code-quality-analyzer': '1.0',
        'test-coverage-analyzer': '1.0',
        'refactoring-suggester': '1.0'
      }
    }
  };
}

async function main() {
  const reportsDir = './reports';
  await fs.mkdir(reportsDir, { recursive: true });

  console.log('Generating sample reports...\n');

  for (let prNum = 1; prNum <= 3; prNum++) {
    const report = generateSampleReport(prNum);
    const baseFileName = `${report.pullRequest.owner}_${report.pullRequest.repo}_${prNum}`;

    // Generate JSON
    const jsonReport = generator.generateJSONReport(report);
    const jsonPath = `${reportsDir}/${baseFileName}.json`;
    await fs.writeFile(jsonPath, jsonReport);
    console.log(`✅ Generated: ${jsonPath}`);

    // Generate Markdown
    const mdReport = generator.generateMarkdownReport(report);
    const mdPath = `${reportsDir}/${baseFileName}.md`;
    await fs.writeFile(mdPath, mdReport);
    console.log(`✅ Generated: ${mdPath}`);

    // Generate HTML
    const htmlReport = generator.generateHTMLReport(report);
    const htmlPath = `${reportsDir}/${baseFileName}.html`;
    await fs.writeFile(htmlPath, htmlReport);
    console.log(`✅ Generated: ${htmlPath}\n`);
  }

  console.log('All sample reports generated successfully!');
}

main().catch(console.error);
