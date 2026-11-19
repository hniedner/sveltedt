// The planted skipped, marked test the trace step must see reported before it trusts a run (run here with no config
// file). It skips itself at run time: only the results show that, never the marker text.
import { expect, test } from "vitest";

// @spec("CAN-01", "2089d6c6")
test.skipIf(true)("planted skip", () => {
  expect(1).toBe(1);
});
