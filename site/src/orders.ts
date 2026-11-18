// The site's fixed list of 20 synthetic orders, in the order the list page shows them.
export interface Order {
  id: string;
  name: string;
}

export const orders: readonly Order[] = Array.from({ length: 20 }, (_, i) => {
  const number = String(i + 1).padStart(2, "0");
  return { id: `o${number}`, name: `Order ${number}` };
});
