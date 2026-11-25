import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.svelte";
import type { DataTableProps } from "./types.ts";

interface Item {
  id: string;
  name: string;
}

const rows: Item[] = [{ id: "r1", name: "Alpha" }];

// A table of the spec's section 11 with the search given unless the test says otherwise
function props(extra: Partial<DataTableProps<Item>> = {}) {
  const all: DataTableProps<Item> = {
    rows,
    columns: [{ id: "name", label: "Name", value: ({ row }) => row.name }],
    getRowId: ({ row }: { row: Item }) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    onsearch: vi.fn(),
    ...extra,
  };
  return all;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Mounts the table at time 0 with the fake clock; `at` moves it to `ms` after the mount (the spec counts from the
// first key, keys taking no time)
function mount(extra: Partial<DataTableProps<Item>> = {}) {
  const onsearch = vi.fn();
  const { rerender } = render(DataTable<Item>, props({ onsearch, ...extra }));
  const field = screen.getByRole<HTMLInputElement>("searchbox", {
    name: "Search",
  });
  let now = 0;
  const keys = async (key: string, value: string) => {
    await fireEvent.keyDown(field, { key });
    await fireEvent.input(field, { target: { value } });
  };
  return {
    onsearch,
    field,
    // One key press and one input event for each character, appended to what the field holds
    type: async (text: string) => {
      for (const char of text) await keys(char, field.value + char);
    },
    backspace: () => keys("Backspace", field.value.slice(0, -1)),
    // The whole text as one input event, as a paste or a script sets it
    paste: (value: string) => fireEvent.input(field, { target: { value } }),
    enter: async () => {
      await fireEvent.keyDown(field, { key: "Enter" });
    },
    // The application's new `search`, the other props as they were
    setSearch: (search: string) =>
      rerender(props({ onsearch, ...extra, search })),
    async at(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms - now);
      now = ms;
    },
  };
}

// @spec("FILT-40", "1c536137")
describe("FILT-40", () => {
  it("shows one field named Search with autocomplete off while onsearch is given", () => {
    render(DataTable<Item>, props());
    const fields = screen.getAllByRole("searchbox", { name: "Search" });
    expect(fields).toHaveLength(1);
    expect(fields[0]?.getAttribute("autocomplete")).toBe("off");
  });

  it("shows no field while onsearch is not given", () => {
    render(DataTable<Item>, props({ onsearch: undefined }));
    expect(screen.queryAllByRole("searchbox")).toEqual([]);
  });

  it("shows no field beside the alert of an invalid table", () => {
    render(DataTable<Item>, props({ columns: [] }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryAllByRole("searchbox")).toEqual([]);
  });
});

// @spec("FILT-41", "261b6b17")
describe("FILT-41", () => {
  it("emits once at 400 ms of typing pause, not at 399 ms", async () => {
    const table = mount();
    await table.type("beta");
    await table.at(399);
    expect(table.onsearch).not.toHaveBeenCalled();
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
  });

  it("restarts the pause at every key", async () => {
    const table = mount();
    await table.type("be");
    await table.at(300);
    await table.type("ta");
    await table.at(699);
    expect(table.onsearch).not.toHaveBeenCalled();
    await table.at(700);
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
  });

  it("emits at once on Enter and the pause then emits nothing more", async () => {
    const table = mount();
    await table.type("beta");
    await table.at(100);
    await table.enter();
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
    await table.at(600);
    expect(table.onsearch).toHaveBeenCalledTimes(1);
  });

  it("emits only on Enter under searchOnEnter", async () => {
    const table = mount({ searchOnEnter: true });
    await table.type("beta");
    await table.at(1000);
    expect(table.onsearch).not.toHaveBeenCalled();
    await table.enter();
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
  });

  it("emits at every key with searchDelay 0", async () => {
    const table = mount({ searchDelay: 0 });
    await table.type("be");
    expect(table.onsearch.mock.calls).toEqual([["b"], ["be"]]);
  });

  it("emits nothing for a text that equals the applied search after typing and Backspace", async () => {
    const table = mount({ search: "beta" });
    expect(table.field.value).toBe("beta");
    await table.type("x");
    await table.backspace();
    await table.at(400);
    expect(table.field.value).toBe("beta");
    expect(table.onsearch).not.toHaveBeenCalled();
  });

  it("emits nothing on Enter in the field of the applied search", async () => {
    const table = mount({ search: "beta" });
    expect(table.field.value).toBe("beta");
    await table.enter();
    expect(table.onsearch).not.toHaveBeenCalled();
  });
});

// @spec("FILT-44", "343d3f01")
describe("FILT-44", () => {
  it("shows the applied search at the mount", () => {
    expect(mount({ search: "beta" }).field.value).toBe("beta");
  });

  it("takes a new search when nothing was typed", async () => {
    const table = mount({ search: "" });
    await table.setSearch("gamma");
    expect(table.field.value).toBe("gamma");
  });

  it("keeps the text it emitted while the search is unchanged", async () => {
    const table = mount();
    await table.type("x");
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["x"]]);
    await table.at(450);
    expect(table.field.value).toBe("x");
  });

  it("takes the new search after the text was emitted", async () => {
    const table = mount();
    await table.type("x");
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["x"]]);
    await table.at(500);
    await table.setSearch("gamma");
    expect(table.field.value).toBe("gamma");
  });

  it("takes a new search after typing that ended equal to the applied search", async () => {
    const table = mount({ search: "beta" });
    await table.type("x");
    await table.backspace();
    await table.at(400);
    expect(table.onsearch).not.toHaveBeenCalled();
    await table.setSearch("gamma");
    expect(table.field.value).toBe("gamma");
  });
});

// @spec("FILT-49", "6b5336d8")
describe("FILT-49", () => {
  it("keeps newer typing when the search changes to the text emitted before it", async () => {
    const table = mount();
    await table.type("mel");
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["mel"]]);
    await table.at(450);
    await table.type("anoma");
    await table.at(500);
    await table.setSearch("mel");
    expect(table.field.value).toBe("melanoma");
    await table.at(850);
    expect(table.onsearch.mock.calls).toEqual([["mel"], ["melanoma"]]);
  });
});

// @spec("FILT-57", "414c7cd1")
describe("FILT-57", () => {
  it("emits the typed text without its outer spaces", async () => {
    const table = mount();
    await table.type(" beta ");
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
  });

  it("emits a pasted text without an outer tab", async () => {
    const table = mount();
    await table.paste("beta\t");
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
  });

  it("emits nothing for a space after the applied search", async () => {
    const table = mount({ search: "beta" });
    await table.type(" ");
    await table.at(400);
    expect(table.onsearch).not.toHaveBeenCalled();
  });

  it("emits the empty text for a field that holds only a space", async () => {
    const table = mount({ search: "beta" });
    await table.paste(" ");
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([[""]]);
  });

  it("emits the trimmed text on Enter", async () => {
    const table = mount();
    await table.type(" beta ");
    await table.at(100);
    await table.enter();
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
  });

  it("keeps the spaces inside and around a quoted phrase", async () => {
    const table = mount();
    await table.paste('" beta "');
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([['" beta "']]);
  });
});

// @spec("FILT-58", "cce56526")
describe("FILT-58", () => {
  it("keeps the typed spaces when search becomes the trimmed text", async () => {
    const table = mount();
    await table.type(" beta ");
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
    await table.at(500);
    await table.setSearch("beta");
    expect(table.field.value).toBe(" beta ");
    // Enter applies the field's text trimmed: equal to the search that reached the component, so no second call
    await table.enter();
    expect(table.onsearch.mock.calls).toEqual([["beta"]]);
  });
});

// @spec("FILT-42", "902c2e39")
describe("FILT-42", () => {
  const refused: [string, string, Partial<DataTableProps<Item>>?][] = [
    ["a control character U+0001", "a\u0001"],
    ["a control character U+007F", "a\u007F"],
    ["an inner tab", "a\tb"],
    ["U+0085, which is a control character and not white space", "a\u0085"],
    ["256 characters", "x".repeat(256)],
    ["11 characters with maxLength 10", "x".repeat(11), { maxLength: 10 }],
    ["256 code points", "\u{1F600}".repeat(256)],
  ];

  it.each(refused)("emits nothing for %s", async (_name, text, extra) => {
    const table = mount(extra);
    await table.paste(text);
    await table.at(400);
    await table.enter();
    expect(table.onsearch).not.toHaveBeenCalled();
  });

  it("emits a text of exactly maxLength characters", async () => {
    const table = mount({ maxLength: 10 });
    await table.paste("x".repeat(10));
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["x".repeat(10)]]);
  });

  it("counts code points, not UTF-16 units", async () => {
    const table = mount();
    await table.paste("\u{1F600}".repeat(255));
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["\u{1F600}".repeat(255)]]);
  });

  it("judges the text without its outer white space", async () => {
    const table = mount();
    await table.paste(`${"x".repeat(255)} `);
    await table.at(400);
    expect(table.onsearch.mock.calls).toEqual([["x".repeat(255)]]);
  });
});

const HIDDEN =
  "The text contains a hidden character, often from pasted text. Clear the field and type the text again.";

// The texts of the elements the field's aria-describedby names
function described(field: HTMLElement): string[] {
  return (field.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "");
}

// @spec("FILT-48", "b1827535")
describe("FILT-48", () => {
  it.each([
    ["a control character", "a\u0001", {}, [HIDDEN]],
    ["U+0085", "a\u0085", {}, [HIDDEN]],
    [
      "11 characters with maxLength 10",
      "x".repeat(11),
      { maxLength: 10 },
      ["Use at most 10 characters."],
    ],
    [
      "1001 characters with maxLength 1000, the grouping proved",
      "x".repeat(1001),
      { maxLength: 1000 },
      ["Use at most 1,000 characters."],
    ],
    [
      "a control character and 300 characters",
      `a\u0001${"x".repeat(300)}`,
      {},
      [HIDDEN, "Use at most 255 characters."],
    ],
  ] as const)(
    "marks %s invalid and describes it by one alert per condition",
    async (_name, text, extra, messages) => {
      const table = mount(extra);
      await table.paste(text);
      expect(table.field.getAttribute("aria-invalid")).toBe("true");
      expect(described(table.field)).toEqual(messages);
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual(messages);
    },
  );

  it("marks nothing once Backspace leaves a text that is accepted", async () => {
    const table = mount();
    await table.paste("a\u0001");
    await table.backspace();
    expect(table.field.getAttribute("aria-invalid")).not.toBe("true");
    expect(described(table.field)).toEqual([]);
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("marks nothing for an outer tab, which is white space", async () => {
    const table = mount();
    await table.paste("a\u0009");
    expect(table.field.getAttribute("aria-invalid")).not.toBe("true");
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("marks an applied search that the field would refuse", () => {
    const table = mount({ search: "a\u0001" });
    expect(table.field.getAttribute("aria-invalid")).toBe("true");
    expect(described(table.field)).toEqual([HIDDEN]);
  });
});
