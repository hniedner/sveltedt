// The planted failure the test step must see reported before it trusts a run (run here with no config file).
import { expect, test } from "vitest";

test("planted failure", () => {
  expect(1).toBe(2);
});
