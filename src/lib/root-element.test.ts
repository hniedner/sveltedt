import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import {
  footprintProps,
  footprintStates,
  type FootprintRow,
} from "../../test/footprint.ts";
import DataTable from "./DataTable.svelte";

// @spec("FOOT-01", "32ef14db")
describe("FOOT-01", () => {
  it("leaves the root element's attributes and inline style unchanged through mount, every state and unmount", async () => {
    const root = document.documentElement;
    const snapshot = (): string[] => [
      ...[...root.attributes].map(({ name, value }) => `${name}=${value}`),
      root.style.cssText,
    ];
    const before = snapshot();
    const { rerender, unmount } = render(
      DataTable<FootprintRow>,
      footprintProps(),
    );
    expect(snapshot()).toEqual(before);
    for (const props of footprintStates) {
      await rerender(footprintProps(props));
      expect(snapshot()).toEqual(before);
    }
    unmount();
    expect(snapshot()).toEqual(before);
  });
});
