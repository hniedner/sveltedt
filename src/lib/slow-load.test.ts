import { fireEvent, render, within } from "@testing-library/svelte";
import { tick } from "svelte";
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
    columns: [{ id: "id", label: "Id", value: ({ row }) => row.id }],
    getRowId: ({ row }) => row.id,
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

  it("leaves the 1000 ms running when a rerender changes neither status nor busy", async () => {
    const table = mount({ status: "loading" });
    await table.at(600);
    await table.change({ status: "loading", rows: twoRows, caption: "Late" });
    await table.at(999);
    expect(table.present()).toBe(false);
    await table.at(1000);
    expect(table.present()).toBe(true);
  });
});

// No marker: STATE-15 and STATE-29 are real-browser statements (site/browser/slow-load.spec.ts); these rows pin the
// status line's class in the simulated DOM, where the unit gate and mutation testing can see it
describe("STATE-15 and STATE-29, the status line's class in the simulated DOM", () => {
  const roomed = (container: HTMLElement): boolean | undefined =>
    within(container)
      .getByRole("status")
      .parentElement?.classList.contains("sdt-status");

  it("keeps no room before the first load, takes it at the first busy and keeps it after the answer", async () => {
    const table = mount({ rows: twoRows });
    expect(roomed(table.container)).toBe(false);
    await table.change({ rows: twoRows, busy: true });
    await tick();
    expect(roomed(table.container)).toBe(true);
    await table.change({ rows: twoRows });
    await tick();
    expect(roomed(table.container)).toBe(true);
  });

  it("keeps no room for a loading table whose input is invalid, and takes it once the input is valid", async () => {
    const table = mount({ status: "loading", columns: [] });
    await table.at(1100);
    expect(roomed(table.container)).toBe(false);
    await table.change({ status: "loading" });
    await tick();
    expect(roomed(table.container)).toBe(true);
  });

  it("keeps the room of a table mounted loading when its answer comes", async () => {
    const table = mount({ status: "loading" });
    expect(roomed(table.container)).toBe(true);
    await table.change({ rows: twoRows });
    await tick();
    expect(roomed(table.container)).toBe(true);
  });

  it.each(["stopped", "failed"] as const)(
    "keeps no room for a table mounted %s until a load starts",
    async (status) => {
      const table = mount({ status });
      await table.at(1100);
      expect(roomed(table.container)).toBe(false);
      await table.change({ status: "loading" });
      await tick();
      expect(roomed(table.container)).toBe(true);
    },
  );
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

  it("removes the indicator when busy ends with the status ready", async () => {
    const table = mount({ rows: twoRows, busy: true });
    await table.at(2000);
    expect(table.present()).toBe(true);
    await table.change({ rows: twoRows, busy: false });
    expect(table.present()).toBe(false);
  });

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
    const table = mount({ status: "loading", oncancel: () => {} });
    await table.at(6000);
    const indicator = table.container.querySelector("[data-sdt-progress]");
    expect(indicator).not.toBeNull();
    // Cancel is shown, so the check below is not about a missing button; it is not in the hidden indicator
    const cancel = within(table.container).getByRole("button", {
      name: "Cancel",
    });
    expect(indicator?.contains(cancel)).toBe(false);
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

// @spec("STATE-17", "aa4c0297")
describe("STATE-17", () => {
  const oncancel = (): void => {};
  const cancel = (container: HTMLElement): HTMLElement | null =>
    within(container).queryByRole("button", { name: "Cancel" });

  it("shows Cancel at 6000 ms of loading with oncancel, not at 5999 ms", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(5999);
    expect(cancel(table.container)).toBeNull();
    await table.at(6000);
    expect(cancel(table.container)).not.toBeNull();
  });

  it("puts Cancel outside the status element and after it", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(6000);
    const button = cancel(table.container);
    const status = within(table.container).getByRole("status");
    expect(button).not.toBeNull();
    expect(status.contains(button)).toBe(false);
    expect(
      status.compareDocumentPosition(button as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows no Cancel without oncancel while the still-loading text is shown", async () => {
    const table = mount({ status: "loading" });
    await table.at(6000);
    expect(table.still()).toBe(true);
    expect(cancel(table.container)).toBeNull();
  });

  it("shows Cancel at 6000 ms of busy with rows", async () => {
    const table = mount({ rows: twoRows, busy: true, oncancel });
    await table.at(6000);
    expect(cancel(table.container)).not.toBeNull();
  });

  it("removes Cancel with the answer at 7000 ms", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(6999);
    expect(cancel(table.container)).not.toBeNull();
    await table.at(7000);
    await table.change({ rows: twoRows, busy: false, oncancel });
    expect(cancel(table.container)).toBeNull();
  });
});

// @spec("STATE-18", "fd6fa1b5")
describe("STATE-18", () => {
  it.each<["Cancel" | "Try again", Partial<DataTableProps<Item>>, number]>([
    ["Cancel", { status: "loading" }, 6000],
    ["Try again", { status: "stopped" }, 0],
    ["Try again", { status: "failed" }, 0],
  ])("emits once on a click of %s with %o", async (name, props, ms) => {
    const calls = { oncancel: vi.fn(), onretry: vi.fn(), onsort: vi.fn() };
    const table = mount({ ...props, ...calls });
    await table.at(ms);
    await fireEvent.click(
      within(table.container).getByRole("button", { name }),
    );
    const own = name === "Cancel" ? calls.oncancel : calls.onretry;
    const other = name === "Cancel" ? calls.onretry : calls.oncancel;
    expect(own).toHaveBeenCalledTimes(1);
    expect(own).toHaveBeenCalledWith();
    expect(other).not.toHaveBeenCalled();
    expect(calls.onsort).not.toHaveBeenCalled();
  });
});

// @spec("STATE-19", "129b94cd")
describe("STATE-19", () => {
  const press = async (container: HTMLElement, name: string): Promise<void> => {
    await fireEvent.click(within(container).getByRole("button", { name }));
  };

  it("leaves a loading table as it was after a press on Cancel", async () => {
    const table = mount({
      status: "loading",
      oncancel: vi.fn(),
      onretry: vi.fn(),
    });
    await table.at(6000);
    await press(table.container, "Cancel");
    const status = within(table.container).getByRole("status");
    expect(status.textContent).toContain("Loading data…");
    expect(status.textContent).toContain("Still loading");
    expect(
      within(table.container).queryByRole("button", { name: "Cancel" }),
    ).not.toBeNull();
  });

  it("leaves a stopped table as it was after a press on Try again", async () => {
    const table = mount({ status: "stopped", onretry: vi.fn() });
    await press(table.container, "Try again");
    expect(
      within(within(table.container).getByRole("table")).getByText(
        "Loading stopped",
      ).isConnected,
    ).toBe(true);
    expect(
      within(table.container).queryByRole("button", { name: "Try again" }),
    ).not.toBeNull();
    expect(
      within(table.container).getByRole("status").textContent,
    ).not.toContain("Loading data…");
  });

  it("leaves a failed table as it was after a press on Try again", async () => {
    const table = mount({ status: "failed", onretry: vi.fn() });
    await press(table.container, "Try again");
    expect(within(table.container).getByRole("alert").textContent.trim()).toBe(
      "The data could not be loaded.",
    );
    expect(
      within(table.container).queryByRole("button", { name: "Try again" }),
    ).not.toBeNull();
  });
});

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

// @spec("A11Y-26", "50ad1535")
describe("A11Y-26", () => {
  const loading: Partial<DataTableProps<Item>> = { status: "loading" };
  const stopped: Partial<DataTableProps<Item>> = { status: "stopped" };
  it.each<[string, Partial<DataTableProps<Item>>[], boolean, number]>([
    ["loading, stopped", [stopped], true, 1],
    [
      "loading, stopped, stopped again with onretry and new rows",
      [stopped, { ...stopped, onretry: () => {}, rows: twoRows }],
      true,
      1,
    ],
    ["loading, stopped, loading", [stopped, loading], false, 1],
    [
      "loading, stopped, loading, stopped",
      [stopped, loading, stopped],
      true,
      2,
    ],
  ])(
    "reads the status region after %s",
    async (_steps, later, inRegion, added) => {
      const table = mount(loading);
      const seen = watchAdditions(table, "Loading stopped");
      for (const step of later) await table.change(step);
      expect(seen.inRegion()).toBe(inRegion);
      expect(seen.added()).toBe(added);
    },
  );
});

// No marker: A11Y-28 is a real-browser statement (site/browser/slow-load.spec.ts); these rows pin the focus move in the
// simulated DOM, where the unit gate and mutation testing can see it
describe("A11Y-28, the focus move of a focused Cancel in the simulated DOM", () => {
  const oncancel = (): void => {};
  const focused = (): Element | null => document.activeElement;
  const cancelOf = (container: HTMLElement): HTMLElement =>
    within(container).getByRole("button", { name: "Cancel" });
  const tableOf = (container: HTMLElement): HTMLElement =>
    within(container).getByRole("table");

  it.each<[string, Partial<DataTableProps<Item>>]>([
    ["ready with two rows", { rows: twoRows }],
    ["stopped", { status: "stopped" }],
    ["failed", { status: "failed" }],
  ])(
    "moves focus to the table without scrolling when the consumer passes %s",
    async (_row, props) => {
      const table = mount({ status: "loading", oncancel });
      await table.at(6000);
      const cancel = cancelOf(table.container);
      cancel.focus();
      expect(focused()).toBe(cancel);
      const focus = vi.spyOn(HTMLElement.prototype, "focus");
      try {
        await table.change({ ...props, oncancel });
        expect(focused()).toBe(tableOf(table.container));
        expect(tableOf(table.container).getAttribute("tabindex")).toBe("-1");
        expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
      } finally {
        focus.mockRestore();
      }
    },
  );

  it("moves focus to the table when the consumer stops passing oncancel", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(6000);
    const cancel = cancelOf(table.container);
    cancel.focus();
    expect(focused()).toBe(cancel);
    await table.change({ status: "loading", oncancel: undefined });
    expect(focused()).toBe(tableOf(table.container));
  });

  it("takes the tabindex off the table when focus leaves it", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(6000);
    cancelOf(table.container).focus();
    await table.change({ status: "stopped", oncancel });
    const outside = document.body.appendChild(document.createElement("button"));
    try {
      expect(focused()).toBe(tableOf(table.container));
      outside.focus();
      expect(tableOf(table.container).hasAttribute("tabindex")).toBe(false);
    } finally {
      outside.remove();
    }
  });

  it("leaves focus alone when a Cancel without focus goes", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(6000);
    const outside = document.body.appendChild(document.createElement("button"));
    try {
      outside.focus();
      await table.change({ rows: twoRows, oncancel });
      expect(focused()).toBe(outside);
      expect(tableOf(table.container).hasAttribute("tabindex")).toBe(false);
    } finally {
      outside.remove();
    }
  });

  it("leaves focus on the body when a focused Cancel goes because the input turned invalid", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(6000);
    cancelOf(table.container).focus();
    await table.change({ columns: [], oncancel });
    expect(within(table.container).getByRole("alert").textContent).toBe(
      "This table cannot be shown.",
    );
    // No table, so no hand-off: Cancel went and focus fell to the page body
    expect(
      within(table.container).queryByRole("button", { name: "Cancel" }),
    ).toBeNull();
    expect(focused()).toBe(document.body);
  });
});

// No marker, as for A11Y-28: the statement is a real-browser one (site/browser/slow-load.spec.ts)
describe("A11Y-30, the focus move of a focused Try again in the simulated DOM", () => {
  const oncancel = (): void => {};
  const onretry = (): void => {};
  const both = { status: "failed", busy: true, oncancel, onretry } as const;
  const focused = (): Element | null => document.activeElement;
  const button = (container: HTMLElement, name: string): HTMLElement =>
    within(container).getByRole("button", { name });
  const tableOf = (container: HTMLElement): HTMLElement =>
    within(container).getByRole("table");

  it.each<[string, "stopped" | "failed", Partial<DataTableProps<Item>>]>([
    ["stopped, then loading", "stopped", { status: "loading" }],
    ["failed, then loading", "failed", { status: "loading" }],
    ["stopped, then ready with two rows", "stopped", { rows: twoRows }],
  ])(
    "moves focus to the table when a focused Try again goes: %s",
    async (_row, first, next) => {
      const table = mount({ status: first, onretry });
      const retry = button(table.container, "Try again");
      retry.focus();
      expect(focused()).toBe(retry);
      await table.change({ ...next, onretry });
      expect(focused()).toBe(tableOf(table.container));
    },
  );

  it("leaves focus alone when a Try again without focus goes", async () => {
    const table = mount({ status: "stopped", onretry });
    const outside = document.body.appendChild(document.createElement("button"));
    try {
      outside.focus();
      await table.change({ status: "loading", onretry });
      expect(focused()).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it("keeps focus on a focused Cancel when Try again goes", async () => {
    const table = mount(both);
    await table.at(6000);
    expect(button(table.container, "Try again").isConnected).toBe(true);
    const cancel = button(table.container, "Cancel");
    cancel.focus();
    await table.change({ ...both, status: "loading" });
    expect(
      within(table.container).queryByRole("button", { name: "Try again" }),
    ).toBeNull();
    expect(focused()).toBe(cancel);
  });

  it("keeps focus on a focused Try again when Cancel goes", async () => {
    const table = mount(both);
    await table.at(6000);
    expect(button(table.container, "Cancel").isConnected).toBe(true);
    const retry = button(table.container, "Try again");
    retry.focus();
    await table.change({ ...both, busy: false });
    expect(
      within(table.container).queryByRole("button", { name: "Cancel" }),
    ).toBeNull();
    expect(focused()).toBe(retry);
  });

  it("hands focus to the table again when a focused Try again goes after Cancel went", async () => {
    const table = mount(both);
    await table.at(6000);
    button(table.container, "Cancel").focus();
    await table.change({ ...both, busy: false });
    expect(focused()).toBe(tableOf(table.container));
    const retry = button(table.container, "Try again");
    retry.focus();
    expect(focused()).toBe(retry);
    await table.change({ ...both, status: "loading", busy: false });
    expect(focused()).toBe(tableOf(table.container));
  });
});

// @spec("FOOT-05", "f912a945")
describe("FOOT-05", () => {
  const oncancel = (): void => {};
  // Mounted loading; `answered`: ready with two rows arrives at 1100 ms; the table is unmounted at `unmountAt`
  it.each([
    ["before the indicator", 500, false],
    ["inside the indicator's minimum", 1200, true],
  ] as const)(
    "leaves no timer pending when unmounted %s at %i ms",
    async (_where, unmountAt, answered) => {
      const table = mount({ status: "loading", oncancel });
      if (answered) {
        await table.at(1100);
        await table.change({ rows: twoRows, oncancel });
      }
      await table.at(unmountAt);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      table.unmount();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("leaves no timer pending when unmounted at 5999 ms, before the still-loading text", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(5999);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    table.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  // The search field's pause (FILT-41) is a timer the table starts after the user's first key; a table unmounted
  // while it runs leaves none behind
  it("leaves no timer pending when unmounted during the search field's pause", async () => {
    const table = mount({ rows: twoRows, onsearch: () => {} });
    await fireEvent.input(
      within(table.container).getByRole("searchbox", { name: "Search" }),
      { target: { value: "beta" } },
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    table.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  // No timer is pending at 6000 ms. With "Cancel" focused, this row keeps the unmount path honest: nothing the focus
  // code leaves behind for a focused button (a teardown that defers work) may outlive the table. A hand-off that defers
  // itself fails earlier, in A11Y-28's rows above, which need focus on the table when the change resolves
  it("leaves no timer pending when unmounted at 6000 ms with Cancel focused, the still-loading text and Cancel shown", async () => {
    const table = mount({ status: "loading", oncancel });
    await table.at(6000);
    expect(table.still()).toBe(true);
    const cancel = within(table.container).getByRole("button", {
      name: "Cancel",
    });
    // None of the table's own timers is pending at 6000 ms; jsdom's focus() then leaves two fake timers of its own
    // (measured with jsdom 31 under Vitest's fake timers), which no table code starts, so they are cleared
    expect(vi.getTimerCount()).toBe(0);
    cancel.focus();
    expect(document.activeElement).toBe(cancel);
    vi.clearAllTimers();
    table.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
