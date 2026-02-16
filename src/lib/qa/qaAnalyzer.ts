// ─── QA Analyzer — send test results to prediction engine for analysis ───────

import type { TestRunResult } from './qaRunner';
import { getAccessToken, getBackendUrl, refreshAuth } from '../auth/auth';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QAAnalysis {
  assessment: string;
  risk_areas: string[];
  suggested_fixes: SuggestedFix[];
  pass_rate_pct: number;
  overall_status: 'healthy' | 'warning' | 'critical';
}

export interface SuggestedFix {
  test_name: string;
  suggestion: string;
  confidence: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Analyze test results using the prediction engine.
 * Falls back to local analysis when backend is unavailable.
 */
export async function analyzeTestResults(
  testResult: TestRunResult,
  projectName: string,
  techStack: string,
): Promise<QAAnalysis> {
  const token = getAccessToken();
  if (token) {
    try {
      return await remoteAnalyze(testResult, projectName, techStack, token);
    } catch (e) {
      console.warn('Remote QA analysis failed, falling back to local:', e);
    }
  }
  return localAnalyze(testResult);
}

// ─── Remote analysis via prediction engine ──────────────────────────────────

async function remoteAnalyze(
  testResult: TestRunResult,
  projectName: string,
  techStack: string,
  token: string,
): Promise<QAAnalysis> {
  const backendUrl = getBackendUrl();

  const body = {
    call_type: 'qa_analysis',
    context_payload: {
      project: { name: projectName },
      tech_stack: { framework: techStack },
      test_output: testResult.raw_output.substring(0, 4000),
      test_summary: {
        total: testResult.total,
        passed: testResult.passed,
        failed: testResult.failed,
        skipped: testResult.skipped,
        runner: testResult.runner,
        failed_tests: testResult.tests
          .filter(t => !t.passed)
          .map(t => ({ name: t.name, error: t.error })),
      },
    },
  };

  let res = await fetch(`${backendUrl}/api/v1/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      res = await fetch(`${backendUrl}/api/v1/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshed.access_token}`,
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    throw new Error(`Backend returned ${res.status}`);
  }

  const data = await res.json();
  return mapToAnalysis(data, testResult);
}

function mapToAnalysis(data: Record<string, unknown>, testResult: TestRunResult): QAAnalysis {
  const passRate = testResult.total > 0 ? (testResult.passed / testResult.total) * 100 : 100;

  return {
    assessment: (data.assessment as string) ?? localAssessment(testResult),
    risk_areas: (data.risk_areas as string[]) ?? [],
    suggested_fixes: (data.suggested_fixes as SuggestedFix[]) ?? [],
    pass_rate_pct: Math.round(passRate),
    overall_status: passRate >= 100 ? 'healthy' : passRate >= 70 ? 'warning' : 'critical',
  };
}

// ─── Local analysis (no backend needed) ─────────────────────────────────────

function localAnalyze(testResult: TestRunResult): QAAnalysis {
  const passRate = testResult.total > 0 ? (testResult.passed / testResult.total) * 100 : 100;

  const failedTests = testResult.tests.filter(t => !t.passed);
  const suggested_fixes: SuggestedFix[] = failedTests.map(t => ({
    test_name: t.name,
    suggestion: t.error ? `Fix: ${t.error.substring(0, 200)}` : 'Check test assertion and fix the failing condition',
    confidence: 'medium',
  }));

  const risk_areas: string[] = [];
  if (testResult.failed > 0) {
    risk_areas.push(`${testResult.failed} test${testResult.failed > 1 ? 's' : ''} failing`);
  }
  if (testResult.skipped > 0) {
    risk_areas.push(`${testResult.skipped} test${testResult.skipped > 1 ? 's' : ''} skipped — may hide issues`);
  }
  if (testResult.total === 0) {
    risk_areas.push('No tests found — changes are unverified');
  }

  return {
    assessment: localAssessment(testResult),
    risk_areas,
    suggested_fixes,
    pass_rate_pct: Math.round(passRate),
    overall_status: passRate >= 100 ? 'healthy' : passRate >= 70 ? 'warning' : 'critical',
  };
}

function localAssessment(testResult: TestRunResult): string {
  if (testResult.total === 0) {
    return 'No tests found. Changes are unverified — consider adding tests before deploying.';
  }

  const passRate = (testResult.passed / testResult.total) * 100;

  if (passRate >= 100) {
    return `All ${testResult.total} tests passing. Changes look safe to commit.`;
  }

  if (passRate >= 70) {
    return `${testResult.passed}/${testResult.total} tests passing (${Math.round(passRate)}%). Review failures before committing.`;
  }

  return `Only ${testResult.passed}/${testResult.total} tests passing (${Math.round(passRate)}%). Significant failures detected — fix recommended.`;
}
