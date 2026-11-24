import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

// A silent spy on console.error for each test of the calling file; returns what the test wrote, one text per call
export function useConsoleErrors(): () => unknown[] {
  let spy: MockInstance<Console["error"]>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());
  return () => spy.mock.calls.map((call): unknown => call[0]);
}

// Runs `run` with esm-env's DEV false, as a production build has it: a test-side mock of the constant that the export
// conditions decide. The caller imports the component inside `run`, after the mock. It proves our branch on DEV; the
// bundler's own production condition is CON-14's to prove.
export async function inProduction(run: () => Promise<void>): Promise<void> {
  vi.resetModules();
  vi.doMock("esm-env", () => ({ DEV: false, BROWSER: true, NODE: false }));
  try {
    await run();
  } finally {
    vi.doUnmock("esm-env");
    vi.resetModules();
  }
}
