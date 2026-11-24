import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import Probe from "../../../test/ConnectionProbe.svelte";
import type {
  Connection,
  ConnectionColumn,
  ConnectionOptions,
} from "./index.ts";

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

// The rows D of A1, each shown by its name
const D = Array.from({ length: 10 }, (_, i) => ({
  id: `r${i}`,
  name: `Row ${i}`,
}));
type Row = (typeof D)[number];
type Body = Record<string, unknown>;
// The answer A1, with the given fields replaced or added
const A1 = (fields: Body = {}): Body => ({
  draw: 1,
  recordsTotal: 1000,
  recordsFiltered: 57,
  data: D,
  ...fields,
});
// A1 without the given field
const A1without = (field: string): Body => {
  const body = A1();
  delete body[field];
  return body;
};

// Mounts the probe with a `send` that records its calls, each settled only by `answer`, and an `onerror` that
// records its calls; `connection` is what the helper returned
function mount(options: Partial<ConnectionOptions> = {}) {
  const settle: ((body: unknown) => void)[] = [];
  const send = vi.fn<ConnectionOptions["send"]>(
    () => new Promise((resolve) => settle.push(resolve)),
  );
  const onerror = vi.fn<ConnectionOptions["onerror"]>();
  let connected: Connection<Row> | undefined;
  render(Probe, {
    options: { send, onerror, columns: M, query: Q0, ...options },
    onconnect: (connection: Connection<Row>) => (connected = connection),
  });
  return {
    send,
    onerror,
    // Settles the call of `send` with index `n` with `body`, then lets the probe update
    answer: async (n: number, body: unknown) => {
      settle[n]?.(body);
      await tick();
    },
    get connection(): Connection<Row> {
      if (connected === undefined)
        throw new Error("the probe gave no connection");
      return connected;
    },
  };
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

// The six pairs of column entry `i`, as the spec lists them
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
// The five request-level pairs, which hold no column and no order
const basePairs: [string, string][] = [
  ["draw", "1"],
  ["start", "0"],
  ["length", "10"],
  ["search[value]", ""],
  ["search[regex]", "false"],
];
const byKey = ([a]: [string, string], [b]: [string, string]) =>
  a < b ? -1 : a > b ? 1 : 0;

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

// A stated limit, outside every statement: a sort id that no column entry serves is thrown out of the mount with its
// name; nothing is sent
describe("an unserved sort id (stated limit)", () => {
  it("throws an Error naming the id and sends nothing", () => {
    const send = vi.fn<ConnectionOptions["send"]>(() => new Promise(() => {}));
    const onerror = vi.fn<ConnectionOptions["onerror"]>();
    const query: ConnectionOptions["query"] = {
      sort: [
        { id: "name", direction: "asc" },
        { id: "unknown", direction: "desc" },
      ],
      limit: 10,
    };
    expect(() =>
      render(Probe, {
        options: { send, onerror, columns: M, query },
        onconnect: () => undefined,
      }),
    ).toThrow('no column map entry serves sort id "unknown"');
    expect(send).not.toHaveBeenCalled();
  });
});

// @spec("CONN-17", "2ad69801")
describe("CONN-17", () => {
  const rows: [string, Body][] = [
    ["A1", A1()],
    ["A1 with draw '1'", A1({ draw: "1" })],
    ["A1 with draw '01'", A1({ draw: "01" })],
    ["A1 without draw", A1without("draw")],
    [
      "A1 with both counts as text",
      A1({ recordsFiltered: "57", recordsTotal: "1000" }),
    ],
    ["A1 with recordsFiltered '057'", A1({ recordsFiltered: "057" })],
    ["A1 with error ''", A1({ error: "" })],
    ["A1 with error null", A1({ error: null })],
    ["A1 with error false", A1({ error: false })],
    ["A1 with error 0", A1({ error: 0 })],
    ["A1 with error_code 'X'", A1({ error_code: "X" })],
    [
      "A1 with an extra field and each row holding DT_RowId",
      A1({
        debug: 1,
        data: D.map((row) => ({ ...row, DT_RowId: `row_${row.id}` })),
      }),
    ],
  ];
  it.each(rows)(
    "maps %s to its own data as the rows, both totals as numbers, ready and not busy",
    async (_row, body) => {
      const probe = mount();
      await probe.answer(0, body);
      const { table } = probe.connection;
      expect(table.rows).toBe(body.data);
      expect(probe.connection.pager?.total).toBe(57);
      expect(probe.connection.pager?.unfilteredTotal).toBe(1000);
      expect(table.status).toBe("ready");
      expect(table.busy).toBe(false);
      expect(probe.onerror).not.toHaveBeenCalled();
    },
  );
});
