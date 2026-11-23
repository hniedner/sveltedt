// The consumer's fixed list of 20 synthetic orders, in the order the list page shows them (LIST-02 of spec/site.md).
// The order is neither ascending nor descending, so a table that sorted the rows would show them differently.
export interface Order {
  id: string;
  name: string;
}

const NUMBERS = "07 03 15 01 20 11 05 18 09 13 02 17 06 14 10 19 04 12 16 08";

export const orders: readonly Order[] = NUMBERS.split(" ").map((number) => ({
  id: `o${number}`,
  name: `Order ${number}`,
}));
