import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import ListPage from "./ListPage.svelte";
import { orders } from "./orders.ts";

// The text of the first cell of each body row, top to bottom
function firstCells(): string[] {
  return screen
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("cell").length > 0)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

// @spec("LIST-01", "ba29e454")
describe("LIST-01", () => {
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

// @spec("LIST-02", "beb6972b")
describe("LIST-02", () => {
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

// @spec("LIST-03", "1629cc69")
describe("LIST-03", () => {
  it("sorts the Order column ascending, descending, then back to the fixed order on three presses", async () => {
    render(ListPage);
    const fixed = orders.map((order) => order.name);
    const ascending = fixed.toSorted();
    const press = () =>
      fireEvent.click(screen.getByRole("button", { name: "Sort by Order" }));
    await press();
    expect(firstCells()).toEqual(ascending);
    await press();
    expect(firstCells()).toEqual(ascending.toReversed());
    await press();
    expect(firstCells()).toEqual(fixed);
  });
});

// @spec("LIST-04", "9bab45c0")
describe("LIST-04", () => {
  it("pages its rows, back to page 1 on a sort, on a size change to the page that holds the first row shown", async () => {
    render(ListPage);
    const fixed = orders.map((order) => order.name);
    const pager = screen.getByRole("navigation", { name: "Orders pages" });
    // The pager comes after the table
    expect(
      screen.getByRole("table").compareDocumentPosition(pager) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const size = within(pager).getByRole<HTMLSelectElement>("combobox", {
      name: "rows per page",
    });
    const shown = (): [string[], string] => [
      firstCells(),
      within(pager).getByText(/^Showing /).textContent ?? "",
    ];
    expect(shown()).toEqual([fixed, "Showing 1 to 20 of 20 rows"]);
    expect([
      size.value,
      within(size)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ]).toEqual(["25", ["5", "10", "25"]]);
    await fireEvent.change(size, { target: { value: "5" } });
    expect(shown()).toEqual([fixed.slice(0, 5), "Showing 1 to 5 of 20 rows"]);
    await fireEvent.click(
      within(pager).getByRole("button", { name: "Page 4" }),
    );
    expect(shown()).toEqual([
      fixed.slice(15, 20),
      "Showing 16 to 20 of 20 rows",
    ]);
    await fireEvent.change(size, { target: { value: "10" } });
    expect(shown()).toEqual([
      fixed.slice(10, 20),
      "Showing 11 to 20 of 20 rows",
    ]);
    await fireEvent.click(
      screen.getByRole("button", { name: "Sort by Order" }),
    );
    expect(shown()).toEqual([
      fixed.toSorted().slice(0, 10),
      "Showing 1 to 10 of 20 rows",
    ]);
  });
});
