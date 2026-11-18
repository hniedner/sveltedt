import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { spec } from "../../test/spec.ts";
import ListPage from "./ListPage.svelte";
import { orders } from "./orders.ts";

// The text of the first cell of each body row, top to bottom
function firstCells(): string[] {
  return screen
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("cell").length > 0)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe(spec("LIST-01", "ba29e454"), () => {
  it("shows one table, named by its caption, with one body row per entry of the fixed list", () => {
    render(ListPage);
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const table = screen.getByRole("table", { name: "Orders" });
    expect(within(table).getByText("Orders").tagName).toBe("CAPTION");
    expect(orders).toHaveLength(20);
    expect(firstCells().toSorted()).toEqual(
      orders.map((order) => order.name).toSorted(),
    );
  });
});

describe(spec("LIST-02", "beb6972b"), () => {
  it("shows the rows in the order of the fixed list", () => {
    render(ListPage);
    expect(firstCells()).toEqual(
      [
        "07",
        "03",
        "15",
        "01",
        "20",
        "11",
        "05",
        "18",
        "09",
        "13",
        "02",
        "17",
        "06",
        "14",
        "10",
        "19",
        "04",
        "12",
        "16",
        "08",
      ].map((number) => `Order ${number}`),
    );
  });
});
