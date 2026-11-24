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
