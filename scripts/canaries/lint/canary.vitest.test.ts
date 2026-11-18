// Planted violations for Vitest's rules: they fire only in a file that imports "vitest".
import { expect, test } from "vitest";

test("has no assertion", () => {});
test.only("is focused", () => {
  expect(1).toBe(1);
});
test.skip("is skipped", () => {
  expect(1).toBe(1);
});
