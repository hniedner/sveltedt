import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The compiled CSS of Bootstrap 5.3.9 (MIT, NOTICE) that THEME-10's second host page loads first. It is a test fixture
// of the site and never part of the package. The hash is that of dist/css/bootstrap.min.css in the npm package
// bootstrap@5.3.9, so "Bootstrap 5.3.9" is a checked fact and not a file name; the file here adds one final line feed,
// which the gate's text step asks of every file.
describe("the vendored Bootstrap fixture", () => {
  it("is the file of bootstrap@5.3.9", () => {
    const file = readFileSync(
      join(import.meta.dirname, "public/vendor/bootstrap.min.css"),
    );
    expect(file.at(-1)).toBe(0x0a);
    expect(
      createHash("sha256").update(file.subarray(0, -1)).digest("hex"),
    ).toBe("9caac977a0af0c2229abd397eee3345899c4020da2a1a0b711c1cc543fe3719d");
  });
});
