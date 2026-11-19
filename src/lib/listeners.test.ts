import { render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import {
  footprintProps,
  footprintStates,
  type FootprintRow,
} from "../../test/footprint.ts";
import ListenerControl from "../../test/ListenerControl.svelte";
import DataTable from "./DataTable.svelte";

// @spec("FOOT-02", "97327221")
describe("FOOT-02", () => {
  it("holds no listener of its own on document or window while mounted or after unmount", async () => {
    // Listeners added minus removed, per target and event type
    const held = new Map<string, number>();
    const count = (key: string, step: number): void => {
      held.set(key, (held.get(key) ?? 0) + step);
    };
    for (const [name, target] of [
      ["document", document],
      ["window", window],
    ] as const) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, "addEventListener").mockImplementation(
        (type, listener, options) => {
          count(`${name} ${type}`, 1);
          add(type, listener, options);
        },
      );
      vi.spyOn(target, "removeEventListener").mockImplementation(
        (type, listener, options) => {
          count(`${name} ${type}`, -1);
          remove(type, listener, options);
        },
      );
    }
    try {
      // What Svelte itself delegates to the document for the event types the table's elements handle
      render(ListenerControl).unmount();
      const svelte = new Set(held.keys());
      const own = (): string[] =>
        [...held]
          .filter(([key, n]) => n !== 0 && !svelte.has(key))
          .map(([key]) => key);
      const { rerender, unmount } = render(
        DataTable<FootprintRow>,
        footprintProps(),
      );
      for (const props of footprintStates) {
        await rerender(footprintProps(props));
        expect(own()).toEqual([]);
      }
      unmount();
      expect(own()).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
