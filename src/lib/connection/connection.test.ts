import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import Probe from "../../../test/ConnectionProbe.svelte";
import type { ConnectionColumn, ConnectionOptions } from "./index.ts";

// The map M and the initial query Q0 of spec/connection.md (the server knows the columns by data and name)
const M: ConnectionColumn[] = [
  { data: "name", name: "n", id: "name" },
  { data: "code", name: "c", id: "code" },
  { data: "status", name: "s", id: "status" },
];
const Q0: ConnectionOptions["query"] = {
  sort: [{ id: "name", direction: "asc" }],
  limit: 10,
};

// Mounts the probe with a `send` that records its calls and never settles
function mount(options: Partial<ConnectionOptions> = {}) {
  const send = vi.fn<ConnectionOptions["send"]>(() => new Promise(() => {}));
  render(Probe, { options: { send, columns: M, query: Q0, ...options } });
  return { send };
}

// @spec("CONN-01", "4dd0aeec")
describe("CONN-01", () => {
  it("calls send once on mount with the request of the initial query and a signal that is not aborted", async () => {
    const { send } = mount();
    expect(send).toHaveBeenCalledTimes(1);
    const [request, signal] = send.mock.calls[0] ?? [];
    expect(request?.get("draw")).toBe("1");
    expect(request?.get("start")).toBe("0");
    expect(request?.get("length")).toBe("10");
    expect(request?.get("order[0][column]")).toBe("0");
    expect(request?.get("order[0][dir]")).toBe("asc");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    // No further call while nothing changes
    await tick();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

// The pairs of the request whose key starts with `order`
const orderOf = (
  request: URLSearchParams | undefined,
): Record<string, string> =>
  Object.fromEntries(
    [...(request ?? [])].filter(([key]) => key.startsWith("order")),
  );

// @spec("CONN-08", "3387c5ec")
describe("CONN-08", () => {
  const MReversed = [M[2], M[1], M[0]] as ConnectionColumn[];
  const rows: [
    string,
    ConnectionColumn[],
    ConnectionOptions["query"]["sort"],
    Record<string, string>,
  ][] = [
    [
      "M, [name asc]",
      M,
      [{ id: "name", direction: "asc" }],
      {
        "order[0][column]": "0",
        "order[0][dir]": "asc",
        "order[0][name]": "n",
      },
    ],
    [
      "M, [code desc, name asc]",
      M,
      [
        { id: "code", direction: "desc" },
        { id: "name", direction: "asc" },
      ],
      {
        "order[0][column]": "1",
        "order[0][dir]": "desc",
        "order[0][name]": "c",
        "order[1][column]": "0",
        "order[1][dir]": "asc",
        "order[1][name]": "n",
      },
    ],
    [
      "M reversed (Status 0, Code 1, Name 2), [name asc]",
      MReversed,
      [{ id: "name", direction: "asc" }],
      {
        "order[0][column]": "2",
        "order[0][dir]": "asc",
        "order[0][name]": "n",
      },
    ],
    ["M, []", M, [], {}],
  ];
  it.each(rows)("sends the order of %s", (_row, columns, sort, order) => {
    const { send } = mount({ columns, query: { sort, limit: 10 } });
    expect(orderOf(send.mock.calls[0]?.[0])).toEqual(order);
  });
});

// @spec("CONN-04", "03516454")
describe("CONN-04", () => {
  it.each([undefined, "bracketed" as const])(
    "sends a URLSearchParams with bracketed keys, booleans as true and false and numbers as decimal text (form %s)",
    (form) => {
      const { send } = mount({ form });
      const request = send.mock.calls[0]?.[0];
      expect(request).toBeInstanceOf(URLSearchParams);
      expect(request?.get("columns[0][search][value]")).toBe("");
      expect(request?.get("columns[0][searchable]")).toBe("true");
      expect(request?.get("start")).toBe("0");
    },
  );
});

// The six pairs of column entry `i`, as the spec lists them, and the five that hold no column or order
const columnPairs = (
  i: number,
  data: string,
  name: string,
): [string, string][] => [
  [`columns[${i}][data]`, data],
  [`columns[${i}][name]`, name],
  [`columns[${i}][searchable]`, "true"],
  [`columns[${i}][orderable]`, "true"],
  [`columns[${i}][search][value]`, ""],
  [`columns[${i}][search][regex]`, "false"],
];
const basePairs: [string, string][] = [
  ["draw", "1"],
  ["start", "0"],
  ["length", "10"],
  ["search[value]", ""],
  ["search[regex]", "false"],
];
const byKey = ([a]: [string, string], [b]: [string, string]) =>
  a < b ? -1 : 1;

// @spec("CONN-02", "96921bb8")
describe("CONN-02", () => {
  const mapPairs = [
    ...columnPairs(0, "name", "n"),
    ...columnPairs(1, "code", "c"),
    ...columnPairs(2, "status", "s"),
  ];
  const rows: [string, Partial<ConnectionOptions>, [string, string][]][] = [
    [
      "M, Q0 (26 pairs)",
      {},
      [
        ...basePairs,
        ...mapPairs,
        ["order[0][column]", "0"],
        ["order[0][dir]", "asc"],
        ["order[0][name]", "n"],
      ],
    ],
    [
      "M plus an entry with no name and no id, Q0",
      { columns: [...M, { data: "internal" }] },
      [
        ...basePairs,
        ...mapPairs,
        ...columnPairs(3, "internal", ""),
        ["order[0][column]", "0"],
        ["order[0][dir]", "asc"],
        ["order[0][name]", "n"],
      ],
    ],
    [
      "M, the query { limit: 10 } only (23 pairs)",
      { query: { limit: 10 } },
      [...basePairs, ...mapPairs],
    ],
  ];
  it.each(rows)("sends exactly the keys of %s", (_row, options, pairs) => {
    const { send } = mount(options);
    expect([...(send.mock.calls[0]?.[0] ?? [])].sort(byKey)).toEqual(
      [...pairs].sort(byKey),
    );
  });
});
