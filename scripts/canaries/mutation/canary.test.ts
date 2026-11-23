import { expect, test } from "vitest";
import { sign, twice } from "./canary.ts";

test("canary", () => {
  expect(twice(2)).toBe(4);
  expect(sign(-1)).toBe(1);
});
