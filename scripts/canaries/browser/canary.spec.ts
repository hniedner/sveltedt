import { expect, test } from "@playwright/test";

test("fails on purpose", () => {
  expect(1).toBe(2);
});
