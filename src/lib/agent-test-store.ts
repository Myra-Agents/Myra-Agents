/**
 * Per-preset agent connectivity-test results, cached in localStorage so the
 * "tested / not tested" state survives reloads and is shared across the UIs that
 * surface it (the Settings preset editor and the schedule modal's preset
 * picker). A preset is keyed by its id; the result is whatever the last
 * `test_agent` rpc returned for it.
 */

export type AgentTestStatus = "passed" | "failed";

export interface StoredTestResult {
  status: AgentTestStatus;
  ts: number;
  reason?: string;
}

const KEY_PREFIX = "myra:agent-test:";

export function loadTestResult(id: string): StoredTestResult | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as StoredTestResult) : null;
  } catch {
    return null;
  }
}

export function persistTestResult(id: string, status: AgentTestStatus, reason?: string): StoredTestResult {
  const result: StoredTestResult = { status, ts: Date.now(), reason };
  try {
    localStorage.setItem(`${KEY_PREFIX}${id}`, JSON.stringify(result));
  } catch {
    // ignore — a missing cache just means we re-test next time.
  }
  return result;
}
