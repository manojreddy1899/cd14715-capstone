import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  ReviewReportSchema,
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema
} from '../src/types/index.js';
import { withRetry, withTimeout, ReviewError, ErrorCodes } from '../src/utils/error-handler.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';

/**
 * Tests for multi-agent code review system
 *
 * Coverage includes:
 * - Schema validation (all three subagent outputs + final report)
 * - Error handling (retry with backoff, timeout)
 * - Rate limiting (token bucket with sliding window)
 * - Configuration and initialization
 */

describe('Schema Validation', () => {
  describe('CodeQualityResultSchema', () => {
    it('should accept valid code quality analysis', () => {
      const validData = {
        file: 'src/payment.ts',
        issues: [
          {
            line: 42,
            severity: 'critical',
            category: 'security',
            description: 'SQL injection vulnerability',
            suggestion: 'Use parameterized queries'
          }
        ],
        overallScore: 75,
        summary: 'Found critical security issue'
      };

      expect(() => CodeQualityResultSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid severity levels', () => {
      const invalidData = {
        file: 'src/payment.ts',
        issues: [
          {
            line: 42,
            severity: 'invalid-severity',
            category: 'security',
            description: 'SQL injection vulnerability',
            suggestion: 'Use parameterized queries'
          }
        ],
        overallScore: 75,
        summary: 'Found critical security issue'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject invalid score (outside 0-100)', () => {
      const invalidData = {
        file: 'src/payment.ts',
        issues: [],
        overallScore: 150,
        summary: 'Good code'
      };

      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should accept empty issues array', () => {
      const validData = {
        file: 'src/utils.ts',
        issues: [],
        overallScore: 100,
        summary: 'No issues found'
      };

      expect(() => CodeQualityResultSchema.parse(validData)).not.toThrow();
    });
  });

  describe('TestCoverageResultSchema', () => {
    it('should accept valid test coverage analysis', () => {
      const validData = {
        file: 'src/utils.ts',
        hasTests: true,
        testFiles: ['src/utils.test.ts'],
        untestedPaths: [
          {
            type: 'edge-case',
            location: 'parseInput (line 23)',
            priority: 'high',
            reasoning: 'Null handling not tested',
            suggestedTest: 'Test with null input'
          }
        ],
        coverageEstimate: 85,
        summary: 'Good coverage with minor gaps'
      };

      expect(() => TestCoverageResultSchema.parse(validData)).not.toThrow();
    });

    it('should accept file with no tests', () => {
      const validData = {
        file: 'src/config.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths: [
          {
            type: 'function',
            location: 'loadConfig',
            priority: 'high',
            reasoning: 'No test file exists',
            suggestedTest: 'Create test file'
          }
        ],
        coverageEstimate: 0,
        summary: 'No test coverage'
      };

      expect(() => TestCoverageResultSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid untested path type', () => {
      const invalidData = {
        file: 'src/utils.ts',
        hasTests: true,
        testFiles: ['src/utils.test.ts'],
        untestedPaths: [
          {
            type: 'invalid-type',
            location: 'parseInput',
            priority: 'high',
            reasoning: 'Null handling',
            suggestedTest: 'Test'
          }
        ],
        coverageEstimate: 85,
        summary: 'Good coverage'
      };

      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(ZodError);
    });
  });

  describe('RefactoringSuggestionSchema', () => {
    it('should accept valid refactoring suggestions', () => {
      const validData = {
        file: 'src/payment.ts',
        suggestions: [
          {
            type: 'extract-function',
            location: 'processPayment (line 10)',
            impact: 'high',
            description: 'Extract validation logic',
            before: 'if (!card) throw Error();',
            after: 'validateCard(card);',
            benefits: 'Better readability'
          }
        ],
        summary: 'Found refactoring opportunity'
      };

      expect(() => RefactoringSuggestionSchema.parse(validData)).not.toThrow();
    });

    it('should accept file with no refactoring suggestions', () => {
      const validData = {
        file: 'src/utils.ts',
        suggestions: [],
        summary: 'Code is well-structured'
      };

      expect(() => RefactoringSuggestionSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid refactoring type', () => {
      const invalidData = {
        file: 'src/payment.ts',
        suggestions: [
          {
            type: 'invalid-type',
            location: 'processPayment',
            impact: 'high',
            description: 'Extract validation',
            before: 'if (!card)',
            after: 'validateCard()',
            benefits: 'Better readability'
          }
        ],
        summary: 'Found opportunity'
      };

      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(ZodError);
    });
  });

  describe('ReviewReportSchema', () => {
    it('should accept valid complete review report', () => {
      const validReport = {
        pullRequest: {
          owner: 'facebook',
          repo: 'react',
          number: 12345
        },
        fileReviews: [
          {
            file: 'src/payment.ts',
            codeQuality: {
              file: 'src/payment.ts',
              issues: [],
              overallScore: 85,
              summary: 'Good code'
            },
            testCoverage: {
              file: 'src/payment.ts',
              hasTests: true,
              testFiles: ['src/payment.test.ts'],
              untestedPaths: [],
              coverageEstimate: 90,
              summary: 'Well tested'
            },
            refactorings: {
              file: 'src/payment.ts',
              suggestions: [],
              summary: 'Code is clean'
            }
          }
        ],
        summary: {
          totalFiles: 1,
          overallScore: 85,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 1000,
          agentVersions: {
            orchestrator: '1.0',
            'code-quality-analyzer': '1.0',
            'test-coverage-analyzer': '1.0',
            'refactoring-suggester': '1.0'
          }
        }
      };

      expect(() => ReviewReportSchema.parse(validReport)).not.toThrow();
    });

    it('should accept multiple file reviews', () => {
      const validReport = {
        pullRequest: { owner: 'fb', repo: 'react', number: 1 },
        fileReviews: [
          {
            file: 'src/a.ts',
            codeQuality: { file: 'src/a.ts', issues: [], overallScore: 90, summary: 'Good' },
            testCoverage: { file: 'src/a.ts', hasTests: true, testFiles: [], untestedPaths: [], coverageEstimate: 95, summary: 'Good' },
            refactorings: { file: 'src/a.ts', suggestions: [], summary: 'Clean' }
          },
          {
            file: 'src/b.ts',
            codeQuality: { file: 'src/b.ts', issues: [], overallScore: 85, summary: 'Good' },
            testCoverage: { file: 'src/b.ts', hasTests: false, testFiles: [], untestedPaths: [], coverageEstimate: 0, summary: 'No tests' },
            refactorings: { file: 'src/b.ts', suggestions: [], summary: 'Clean' }
          }
        ],
        summary: { totalFiles: 2, overallScore: 87, criticalIssues: 0, highPriorityTests: 0, refactoringOpportunities: 0 },
        recommendations: [],
        metadata: { analyzedAt: new Date().toISOString(), duration: 1000, agentVersions: {} }
      };

      expect(() => ReviewReportSchema.parse(validReport)).not.toThrow();
    });
  });
});

describe('Error Handling', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = async () => 'success';
      const result = await withRetry(fn, 3, 100);
      expect(result).toBe('success');
    });

    it('should retry and succeed after failure', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 2) throw new Error('Fail');
        return 'success';
      };

      const result = await withRetry(fn, 3, 100);
      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should throw ReviewError when retries exhausted', async () => {
      const fn = async () => {
        throw new Error('Always fails');
      };

      await expect(withRetry(fn, 2, 50)).rejects.toThrow(ReviewError);
    });

    it('should use exponential backoff', async () => {
      let attempts = 0;
      const startTime = Date.now();
      const fn = async () => {
        attempts++;
        if (attempts < 3) throw new Error('Fail');
        return 'success';
      };

      await withRetry(fn, 3, 50);
      const duration = Date.now() - startTime;

      // Should have waited at least 50ms for first retry + 100ms for second
      // (accounting for jitter and execution time)
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('withTimeout', () => {
    it('should succeed if function completes before timeout', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      };

      const result = await withTimeout(fn, 200);
      expect(result).toBe('success');
    });

    it('should timeout if function exceeds timeout', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        return 'success';
      };

      await expect(withTimeout(fn, 100)).rejects.toThrow(ReviewError);
    });

    it('should include timeout in error metadata', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      };

      try {
        await withTimeout(fn, 100);
      } catch (error) {
        if (error instanceof ReviewError) {
          expect(error.code).toBe(ErrorCodes.AGENT_TIMEOUT);
          expect(error.metadata?.timeoutMs).toBe(100);
        }
      }
    });
  });
});

describe('Rate Limiter', () => {
  it('should allow requests within limits', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 10,
      maxTokensPerMinute: 10000,
      maxConcurrent: 5
    });

    await limiter.acquire(1000);
    expect(limiter.getStatus().activeRequests).toBe(1);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
  });

  it('should track concurrent requests', async () => {
    const limiter = new RateLimiter({
      maxConcurrent: 2,
      maxRequestsPerMinute: 100,
      maxTokensPerMinute: 100000
    });

    await limiter.acquire(500);
    expect(limiter.getStatus().activeRequests).toBe(1);

    await limiter.acquire(500);
    expect(limiter.getStatus().activeRequests).toBe(2);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(1);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
  });

  it('should detect when it can proceed', () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 10,
      maxTokensPerMinute: 10000,
      maxConcurrent: 5
    });

    expect(limiter.canProceed(1000)).toBe(true);
  });

  it('should handle multiple requests', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 5,
      maxTokensPerMinute: 5000,
      maxConcurrent: 10
    });

    for (let i = 0; i < 3; i++) {
      await limiter.acquire(1000);
    }

    const status = limiter.getStatus();
    expect(status.activeRequests).toBe(3);
    expect(status.requestsInWindow).toBe(3);
    expect(status.tokensInWindow).toBe(3000);
  });
});

describe('CodeReviewOrchestrator', () => {
  // Note: Full integration tests would require mocking the query function and MCP servers
  // These basic tests just verify the class can be instantiated

  it('should be properly exported from orchestrator module', async () => {
    const orchestratorModule = await import('../src/orchestrator.js');
    expect(orchestratorModule.CodeReviewOrchestrator).toBeDefined();
  });

  it('should validate configuration options', async () => {
    const { CodeReviewOrchestrator } = await import('../src/orchestrator.js');

    // Should create instance with no errors
    const orchestrator1 = new CodeReviewOrchestrator();
    expect(orchestrator1).toBeDefined();

    // Should accept custom configuration
    const orchestrator2 = new CodeReviewOrchestrator({
      model: 'claude-opus-4-5-20251101',
      maxTurns: 20
    });
    expect(orchestrator2).toBeDefined();
  });
});
