import { render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.svelte";
import type { DataTableProps } from "./types.ts";

interface Item {
  id: string;
}

const twoRows: Item[] = [{ id: "r1" }, { id: "r2" }];

// The props a rerender passes in full, so no prop of an earlier state stays behind
function state(props: Partial<DataTableProps<Item>>): DataTableProps<Item> {
  return {
    rows: [],
    columns: [{ id: "id", label: "Id", value: (row) => row.id }],
    getRowId: (row) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    status: "ready",
    busy: false,
    ...props,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Mounts the table at time 0 and moves the fake clock by the spec's times, counted from the mount
function mount(first: Partial<DataTableProps<Item>>) {
  const view = render(DataTable<Item>, state(first));
  let now = 0;
  return {
    ...view,
    // Advances to `ms` after the mount
    async at(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms - now);
      now = ms;
    },
    async change(props: Partial<DataTableProps<Item>>): Promise<void> {
      await view.rerender(state(props));
    },
    present: (): boolean =>
      view.container.querySelector("[data-sdt-progress]") !== null,
  };
}

// @spec("STATE-09", "2bf569f2")
describe("STATE-09", () => {
  it("shows the indicator at 1000 ms of loading, not at 999 ms", async () => {
    const table = mount({ status: "loading" });
    await table.at(999);
    expect(table.present()).toBe(false);
    await table.at(1000);
    expect(table.present()).toBe(true);
  });

  it("shows the indicator at 1000 ms of busy, not at 999 ms", async () => {
    const table = mount({ rows: twoRows, busy: true });
    await table.at(999);
    expect(table.present()).toBe(false);
    await table.at(1000);
    expect(table.present()).toBe(true);
  });

  it("counts a change from loading to busy as no gap", async () => {
    const table = mount({ status: "loading" });
    await table.at(600);
    await table.change({ rows: twoRows, busy: true });
    await table.at(999);
    expect(table.present()).toBe(false);
    await table.at(1000);
    expect(table.present()).toBe(true);
  });

  it("restarts the 1000 ms after a gap", async () => {
    const table = mount({ status: "loading" });
    await table.at(600);
    await table.change({ rows: twoRows });
    await table.at(700);
    await table.change({ status: "loading" });
    await table.at(1000);
    expect(table.present()).toBe(false);
    await table.at(1699);
    expect(table.present()).toBe(false);
    await table.at(1700);
    expect(table.present()).toBe(true);
  });
});
