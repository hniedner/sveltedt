import { render } from "@testing-library/svelte";
import type { Component } from "svelte";
import { vi } from "vitest";
import type { DataTableProps } from "../src/lib/types.ts";
import ListenerControl from "./ListenerControl.svelte";

// The footprint tests' table (FOOT-01, FOOT-02). Each of them lives in a test file of its own: every test file
// gets a fresh document, so its first mount is the first in that document, and nothing an earlier mount left
// behind can hide in what the test measures before it.

export interface FootprintRow {
  id: string;
  name: string;
}

// The props of a mount or rerender, in full, so no prop of an earlier state stays behind
export function footprintProps(
  props: Partial<DataTableProps<FootprintRow>> = {},
): DataTableProps<FootprintRow> {
  return {
    rows: [{ id: "r1", name: "Beta" }],
    columns: [{ id: "name", label: "Name", value: (row) => row.name }],
    getRowId: (row) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    status: "ready",
    busy: false,
    ...props,
  };
}

// The rerenders after a mount with status ready and one row: loading, failed, ready with rows, busy, the alert
export const footprintStates: Partial<DataTableProps<FootprintRow>>[] = [
  { status: "loading" },
  { status: "failed" },
  {
    rows: [
      { id: "r1", name: "Beta" },
      { id: "r2", name: "Gamma" },
    ],
  },
  { busy: true },
  { columns: [] },
];

// Wraps addEventListener and removeEventListener on document and window, then mounts and unmounts the control to
// measure what Svelte itself delegates to the document; the control handles every event type the measured component
// handles. Returns a reader of the listeners held beyond those, per target and event type. The caller restores the
// wrapped methods (vi.restoreAllMocks). Stated limit: a document listener of a type the control handles counts as
// Svelte's own, so one the component added would not show.
export function watchListeners(
  control: Component = ListenerControl,
): () => string[] {
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
  render(control).unmount();
  const svelte = new Set(held.keys());
  return () =>
    [...held]
      .filter(([key, n]) => n !== 0 && !svelte.has(key))
      .map(([key]) => key);
}
