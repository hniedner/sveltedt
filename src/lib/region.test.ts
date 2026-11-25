import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.svelte";
import type { DataTableProps } from "./types.ts";

interface Item {
  id: string;
}

// The one observer the table builds: what it was handed, what it watches, whether it was disconnected. jsdom has no
// ResizeObserver, so this stub lives only here (a test of an adopter's own has none either, which the last row pins)
class Recorder {
  static all: Recorder[] = [];
  watched: Element[] = [];
  disconnected = false;
  readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    Recorder.all.push(this);
  }
  observe(element: Element): void {
    this.watched.push(element);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

beforeEach(() => {
  Recorder.all = [];
  vi.stubGlobal("ResizeObserver", Recorder);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function props(more: Partial<DataTableProps<Item>> = {}): DataTableProps<Item> {
  return {
    rows: [{ id: "r1" }],
    columns: [{ id: "id", label: "Id", value: ({ row }) => row.id }],
    getRowId: ({ row }) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    ...more,
  };
}

// jsdom lays nothing out: the widths a browser would measure
function measure(region: HTMLElement, content: number, shown: number): void {
  Object.defineProperty(region, "scrollWidth", {
    configurable: true,
    value: content,
  });
  Object.defineProperty(region, "clientWidth", {
    configurable: true,
    value: shown,
  });
}

async function mount() {
  const view = render(DataTable<Item>, props());
  await tick();
  const region = screen.getByRole("region", { name: "Orders table" });
  const [observer] = Recorder.all;
  if (!observer) throw new Error("no observer was built");
  return { view, region, observer };
}

// No marker: A11Y-12 is a real-browser statement (site/browser/table.spec.ts); these rows pin the effect's logic in
// the simulated DOM, where the unit gate and mutation testing can see it
describe("A11Y-12, the region's Tab stop in the simulated DOM", () => {
  it("sets tabindex 0 when the content is wider than the region, and removes it when it is not", async () => {
    const { region, observer } = await mount();
    measure(region, 700, 600);
    observer.callback();
    expect(region.getAttribute("tabindex")).toBe("0");
    measure(region, 600, 600);
    observer.callback();
    expect(region.hasAttribute("tabindex")).toBe(false);
  });

  it("watches the region and the table, and nothing else", async () => {
    const { region, observer } = await mount();
    expect(observer.watched).toEqual([region, region.querySelector("table")]);
  });

  it("disconnects its observer when the table unmounts", async () => {
    const { view, observer } = await mount();
    expect(observer.disconnected).toBe(false);
    view.unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("builds no observer for invalid input, which has no region", async () => {
    render(DataTable<Item>, props({ columns: [] }));
    await tick();
    expect(Recorder.all).toEqual([]);
  });

  it("builds a second observer, and disconnects the first, when the region comes back after invalid input", async () => {
    const view = render(DataTable<Item>, props());
    await tick();
    const [first] = Recorder.all;
    await view.rerender(props({ columns: [] }));
    await tick();
    expect(first?.disconnected).toBe(true);
    await view.rerender(props());
    await tick();
    const region = screen.getByRole("region", { name: "Orders table" });
    expect(Recorder.all).toHaveLength(2);
    expect(Recorder.all[1]?.watched).toEqual([
      region,
      region.querySelector("table"),
    ]);
  });

  it("neither throws nor sets a tabindex where the environment has no ResizeObserver", async () => {
    vi.unstubAllGlobals();
    expect(typeof ResizeObserver).toBe("undefined");
    render(DataTable<Item>, props());
    await tick();
    expect(
      screen
        .getByRole("region", { name: "Orders table" })
        .hasAttribute("tabindex"),
    ).toBe(false);
  });
});
