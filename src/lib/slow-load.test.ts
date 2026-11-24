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
    still: (): boolean =>
      (view.container.textContent ?? "").includes("Still loading"),
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

// @spec("STATE-10", "fe290072")
describe("STATE-10", () => {
  // Mounted loading, so the indicator appears at 1000 ms; the answer comes at `answerAt`
  it.each([
    ["ready", 1100, 1499, 1500],
    ["failed", 1100, 1499, 1500],
    ["ready", 2000, 1999, 2000],
    ["stopped", 2000, 1999, 2000],
  ] as const)(
    "after an answer of status %s at %i ms, keeps the indicator at %i ms and removes it at %i ms",
    async (status, answerAt, presentAt, goneAt) => {
      const table = mount({ status: "loading" });
      const answer = () =>
        table.change({ status, rows: status === "ready" ? twoRows : [] });
      if (presentAt < answerAt) {
        await table.at(presentAt);
        expect(table.present()).toBe(true);
        await table.at(answerAt);
        await answer();
      } else {
        await table.at(answerAt);
        await answer();
        await table.at(presentAt);
        expect(table.present()).toBe(true);
      }
      await table.at(goneAt);
      expect(table.present()).toBe(false);
    },
  );

  it("keeps the indicator when loading resumes inside the minimum, until the next answer", async () => {
    const table = mount({ status: "loading" });
    await table.at(1100);
    await table.change({ rows: twoRows });
    await table.at(1200);
    await table.change({ status: "loading" });
    await table.at(2499);
    expect(table.present()).toBe(true);
    await table.change({ rows: twoRows });
    await table.at(2500);
    expect(table.present()).toBe(false);
  });
});

// @spec("STATE-11", "75ae94f3")
describe("STATE-11", () => {
  it("hides the indicator from assistive technology and puts nothing focusable in it", async () => {
    const table = mount({ status: "loading" });
    await table.at(6000);
    const indicator = table.container.querySelector("[data-sdt-progress]");
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute("aria-hidden")).toBe("true");
    expect(indicator?.hasAttribute("tabindex")).toBe(false);
    expect(
      indicator?.querySelectorAll(
        "a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable], [role=button], [role=link]",
      ).length,
    ).toBe(0);
  });
});

// @spec("STATE-12", "e4b5242e")
describe("STATE-12", () => {
  it("shows the text at 6000 ms of loading, not at 5999 ms", async () => {
    const table = mount({ status: "loading" });
    await table.at(5999);
    expect(table.still()).toBe(false);
    await table.at(6000);
    expect(table.still()).toBe(true);
  });

  it("shows the text at 6000 ms of busy", async () => {
    const table = mount({ rows: twoRows, busy: true });
    await table.at(5999);
    expect(table.still()).toBe(false);
    await table.at(6000);
    expect(table.still()).toBe(true);
  });

  it("removes the text with the answer at 7000 ms", async () => {
    const table = mount({ status: "loading" });
    await table.at(6999);
    expect(table.still()).toBe(true);
    await table.at(7000);
    await table.change({ rows: twoRows });
    expect(table.still()).toBe(false);
  });

  it("removes the text and the indicator with a failure at 6100 ms", async () => {
    const table = mount({ status: "loading" });
    await table.at(6099);
    expect(table.still()).toBe(true);
    await table.at(6100);
    await table.change({ status: "failed" });
    expect(table.still()).toBe(false);
    expect(table.present()).toBe(false);
  });

  it("runs the 5 s from the first appearance when loading resumes inside the minimum", async () => {
    const table = mount({ status: "loading" });
    await table.at(1100);
    await table.change({ rows: twoRows });
    await table.at(1200);
    await table.change({ status: "loading" });
    await table.at(5999);
    expect(table.still()).toBe(false);
    await table.at(6000);
    expect(table.still()).toBe(true);
  });
});

// Counts how often the words are put into the status region: a node added with them, or a text changed to them
function watchAdditions(table: ReturnType<typeof mount>, words: string) {
  const region = table.container.querySelector('[role="status"]');
  if (!region) throw new Error("no status region");
  let added = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) {
          if (node.textContent?.includes(words)) added += 1;
        }
      } else if (
        record.oldValue !== null &&
        !record.oldValue.includes(words) &&
        record.target.textContent?.includes(words)
      ) {
        added += 1;
      }
    }
  });
  observer.observe(region, {
    childList: true,
    characterData: true,
    characterDataOldValue: true,
    subtree: true,
  });
  return {
    inRegion: (): boolean => region.textContent?.includes(words) ?? false,
    added: (): number => {
      observer.takeRecords();
      return added;
    },
  };
}

// @spec("A11Y-20", "42a3ade6")
describe("A11Y-20", () => {
  it("says the text once when busy joins loading and the load goes on", async () => {
    const table = mount({ status: "loading" });
    const seen = watchAdditions(table, "Still loading");
    await table.at(6000);
    await table.change({ status: "loading", rows: twoRows, busy: true });
    await table.at(8000);
    expect(seen.inRegion()).toBe(true);
    expect(seen.added()).toBe(1);
  });

  it("says the text once when the rows are replaced by new objects", async () => {
    const table = mount({ rows: twoRows, busy: true });
    const seen = watchAdditions(table, "Still loading");
    await table.at(6000);
    await table.change({
      rows: twoRows.map((row) => ({ ...row })),
      busy: true,
    });
    expect(seen.inRegion()).toBe(true);
    expect(seen.added()).toBe(1);
  });

  it("has said it once when the answer takes it away", async () => {
    const table = mount({ status: "loading" });
    const seen = watchAdditions(table, "Still loading");
    await table.at(7000);
    await table.change({ rows: twoRows });
    expect(seen.inRegion()).toBe(false);
    expect(seen.added()).toBe(1);
  });

  it("says it again when a later load gets as long", async () => {
    const table = mount({ status: "loading" });
    const seen = watchAdditions(table, "Still loading");
    await table.at(7000);
    await table.change({ rows: twoRows });
    await table.at(7100);
    await table.change({ status: "loading" });
    await table.at(13100);
    expect(seen.inRegion()).toBe(true);
    expect(seen.added()).toBe(2);
  });

  it("lets a reader say only the added text, not the whole status region", () => {
    const table = mount({ status: "loading" });
    expect(
      table.container
        .querySelector('[role="status"]')
        ?.getAttribute("aria-atomic"),
    ).toBe("false");
  });
});

// @spec("FOOT-05", "9f08d2c3")
describe("FOOT-05", () => {
  // Mounted loading; `answer` is the status at 1100 ms, if any; the table is unmounted at `unmountAt`
  it.each([
    ["before the indicator", 500, false],
    ["inside the indicator's minimum", 1200, true],
  ] as const)(
    "leaves no timer pending when unmounted %s at %i ms",
    async (_where, unmountAt, answered) => {
      const table = mount({ status: "loading" });
      if (answered) {
        await table.at(1100);
        await table.change({ rows: twoRows });
      }
      await table.at(unmountAt);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      table.unmount();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("leaves no timer pending when unmounted at 5999 ms, before the still-loading text", async () => {
    const table = mount({ status: "loading" });
    await table.at(5999);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    table.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
