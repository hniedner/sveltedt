// Planted violations for Vitest's rules: they fire on test calls imported from "vitest" or used as globals.
import { expect, test } from "vitest";

test("has no assertion", () => {});
test.only("is focused", () => {
  expect(1).toBe(1);
});
test.skip("is skipped", () => {
  expect(1).toBe(1);
});
test("asserts nothing with its expect", () => {
  expect(1 === 1);
});
