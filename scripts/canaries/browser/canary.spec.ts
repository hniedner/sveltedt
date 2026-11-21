import { expect, test } from "@playwright/test";

// @spec("CANARY-01", "00000000")
test("fails on purpose", () => {
  expect(1).toBe(2);
});
