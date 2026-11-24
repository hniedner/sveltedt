import { render, screen } from "@testing-library/svelte";
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

// @spec("CONN-01", "a9d7c397")
describe("CONN-01", () => {
  it("calls send once on mount with one object holding the request of the initial query and a signal that is not aborted", async () => {
    const { send } = mount();
    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0] ?? [];
    expect(call).toHaveLength(1);
    const request = call[0]?.request;
    const signal = call[0]?.signal;
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
    expect(orderOf(send.mock.calls[0]?.[0]?.request)).toEqual(order);
  });
});

// @spec("CONN-04", "03516454")
describe("CONN-04", () => {
  it.each([undefined, "bracketed" as const])(
    "sends a URLSearchParams with bracketed keys, booleans as true and false and numbers as decimal text (form %s)",
    (form) => {
      const { send } = mount({ form });
      const request = send.mock.calls[0]?.[0]?.request;
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
    expect([...(send.mock.calls[0]?.[0]?.request ?? [])].sort(byKey)).toEqual(
      [...pairs].sort(byKey),
    );
  });
});

// @spec("CONN-03", "1bdcf223")
describe("CONN-03", () => {
  const rows: [string, Partial<ConnectionColumn>, string, string][] = [
    ["as in M", {}, "true", "true"],
    ["orderable false", { orderable: false }, "true", "false"],
    [
      "searchable false, orderable false",
      { searchable: false, orderable: false },
      "false",
      "false",
    ],
  ];
  it.each(rows)(
    "sends the flags of entry 1 with %s",
    (_row, flags, searchable, orderable) => {
      const { send } = mount({
        columns: M.map((column, i) =>
          i === 1 ? { ...column, ...flags } : column,
        ),
      });
      const request = send.mock.calls[0]?.[0]?.request;
      expect(request?.get("columns[1][searchable]")).toBe(searchable);
      expect(request?.get("columns[1][orderable]")).toBe(orderable);
    },
  );
});

// @spec("CONN-13", "b0765463")
describe("CONN-13", () => {
  const codeDesc = { id: "code", direction: "desc" } as const;
  const sorted = {
    start: "0",
    column: "1",
    dir: "desc",
  };
  const read = (request: URLSearchParams | undefined) => ({
    start: request?.get("start"),
    column: request?.get("order[0][column]"),
    dir: request?.get("order[0][dir]"),
  });
  it("sends one request from the first row, the sort and the offset set before it is settled, on table.onsort from offset 20", async () => {
    const probe = mount({ query: { ...Q0, offset: 20 } });
    await probe.answer(0, A1());
    probe.connection.table.onsort([codeDesc]);
    expect(probe.send).toHaveBeenCalledTimes(2);
    expect(read(probe.send.mock.calls[1]?.[0]?.request)).toEqual(sorted);
    expect(probe.connection.table.sort).toEqual([codeDesc]);
    expect(probe.connection.pager?.offset).toBe(0);
  });
  it("sends one request and keeps no pager on table.onsort before the first answer", () => {
    const probe = mount();
    probe.connection.table.onsort([codeDesc]);
    expect(probe.send).toHaveBeenCalledTimes(2);
    expect(read(probe.send.mock.calls[1]?.[0]?.request)).toEqual(sorted);
    expect(probe.connection.table.sort).toEqual([codeDesc]);
    expect(probe.connection.pager).toBeUndefined();
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
  it("is ready and not busy when the second request is answered, after A1", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    await probe.answer(1, A1({ draw: 2 }));
    expect(probe.connection.table.status).toBe("ready");
    expect(probe.connection.table.busy).toBe(false);
  });
});

// @spec("CONN-07", "2031b1f6")
describe("CONN-07", () => {
  it.each([
    [0, 10],
    [20, 25],
  ])(
    "sends start and length from the query's offset %i and limit %i, the pager keeping that limit",
    async (offset, limit) => {
      const probe = mount({ query: { ...Q0, offset, limit } });
      const request = probe.send.mock.calls[0]?.[0]?.request;
      expect(request?.get("start")).toBe(String(offset));
      expect(request?.get("length")).toBe(String(limit));
      await probe.answer(0, A1());
      expect(probe.connection.pager?.limit).toBe(limit);
    },
  );
  it("sends one request with start 30 and length 10 on pager.onpage(30) from offset 20, the pager at 30 before it is settled", async () => {
    const probe = mount({ query: { ...Q0, offset: 20 } });
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(30);
    expect(probe.send).toHaveBeenCalledTimes(2);
    const request = probe.send.mock.calls[1]?.[0]?.request;
    expect(request?.get("start")).toBe("30");
    expect(request?.get("length")).toBe("10");
    expect(probe.connection.pager?.offset).toBe(30);
  });
});

// @spec("CONN-15", "55774a4d")
describe("CONN-15", () => {
  it("sends draw 1 on mount, then 2 and 3 for two page changes", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    await probe.answer(1, A1({ draw: 2 }));
    probe.connection.pager?.onpage(20);
    expect(
      probe.send.mock.calls.map(([{ request }]) => request.get("draw")),
    ).toEqual(["1", "2", "3"]);
  });
});

// What a failed answer leaves: the table's state, and the message of each Error `onerror` received (a value
// that is no Error stays as it is, so the comparison fails on it)
const outcome = (probe: ReturnType<typeof mount>) => ({
  status: probe.connection.table.status,
  busy: probe.connection.table.busy,
  rows: probe.connection.table.rows,
  errors: probe.onerror.mock.calls.map(([error]) =>
    error instanceof Error ? error.message : error,
  ),
});
const failed = (rows: unknown) => ({
  status: "failed",
  busy: false,
  rows,
  errors: ["The answer does not match the request."],
});

// @spec("CONN-18", "9fef58fa")
describe("CONN-18", () => {
  const badCounts = [
    -1,
    1.5,
    "5x",
    "-1",
    "",
    2 ** 53,
    null,
    "1e3",
    "+5",
    " 5",
    "5.0",
    "9007199254740993",
    [5],
  ];
  const rows: [string, unknown][] = [
    ["null", null],
    ["'ok'", "ok"],
    ["[]", []],
    ["A1 without recordsTotal", A1without("recordsTotal")],
    ["A1 without recordsFiltered", A1without("recordsFiltered")],
    ["A1 without data", A1without("data")],
    ...["recordsFiltered", "recordsTotal"].flatMap((field): [string, Body][] =>
      badCounts.map((count) => [
        `A1 with ${field} ${JSON.stringify(count)}`,
        A1({ [field]: count }),
      ]),
    ),
    ["A1 with data {}", A1({ data: {} })],
    ...[2, "2", null, "1a", " 1", "1e0", "+1", "1.0", [1]].map(
      (draw): [string, Body] => [
        `A1 with draw ${JSON.stringify(draw)}`,
        A1({ draw }),
      ],
    ),
  ];
  it.each(rows)("fails on %s", async (_row, body) => {
    const probe = mount();
    await probe.answer(0, body);
    expect(outcome(probe)).toEqual(failed([]));
  });
  it("fails the second request answered without data, not busy", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    await probe.answer(1, { ...A1without("data"), draw: 2 });
    expect(outcome(probe)).toEqual(failed(D));
  });
  it("fails an answer of the first request's draw to the second request, the rows kept", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    expect(probe.send.mock.calls[1]?.[0].request.get("draw")).toBe("2");
    await probe.answer(1, A1());
    expect(outcome(probe)).toEqual(failed(D));
  });
});

// The pager's props, as the spec lists them for A1 and the page asked for
const pagerAt = (offset: number) => ({
  offset,
  limit: 10,
  total: 57,
  unfilteredTotal: 1000,
});
const pagination = () =>
  screen.queryByRole("navigation", { name: "Rows pages" });

// @spec("CONN-25", "9825a667")
describe("CONN-25", () => {
  it("has no pager and no Pagination after mount, nothing settled", () => {
    const probe = mount();
    expect(probe.connection.pager).toBeUndefined();
    expect(pagination()).toBeNull();
  });
  it("has no pager and no Pagination after the first request failed", async () => {
    const probe = mount();
    await probe.answer(0, A1({ recordsFiltered: "5x" }));
    expect(probe.connection.pager).toBeUndefined();
    expect(pagination()).toBeNull();
  });
  it("gives the pager and shows Pagination after A1", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    expect(probe.connection.pager).toMatchObject(pagerAt(0));
    expect(pagination()).not.toBeNull();
  });
  it("keeps the pager at the page asked for, with the last totals, after a failed page change", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    await probe.answer(1, A1({ draw: 2, recordsFiltered: "5x" }));
    expect(probe.connection.pager).toMatchObject(pagerAt(10));
    expect(pagination()).not.toBeNull();
  });
});

// @spec("CONN-23", "1237693e")
describe("CONN-23", () => {
  it("runs the first request as loading, not busy", () => {
    const { connection } = mount();
    expect(connection.table).toMatchObject({ status: "loading", busy: false });
  });
  it("is loading and not busy from creation, before onMount runs", () => {
    // `onconnect` is called from the probe's script, before the helper's onMount has run
    let atCreation: unknown;
    render(Probe, {
      options: {
        send: () => new Promise(() => {}),
        onerror: vi.fn(),
        columns: M,
        query: Q0,
      },
      onconnect: (connection: Connection<Row>) =>
        (atCreation = { ...connection.table }),
    });
    expect(atCreation).toMatchObject({ status: "loading", busy: false });
  });
  it("runs a request with A1 on screen as busy, ready, the rows kept", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    expect(probe.connection.table).toMatchObject({
      status: "ready",
      busy: true,
      rows: D,
    });
  });
  it("runs a request with an answer of 0 rows on screen as busy and ready", async () => {
    const probe = mount();
    await probe.answer(
      0,
      A1({ recordsTotal: 0, recordsFiltered: 0, data: [] }),
    );
    probe.connection.pager?.onpage(0);
    expect(probe.connection.table).toMatchObject({
      status: "ready",
      busy: true,
    });
  });
  it("runs a request after a failed one as loading, not busy", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    await probe.answer(1, A1({ draw: 2, recordsFiltered: "5x" }));
    probe.connection.pager?.onpage(20);
    expect(probe.connection.table).toMatchObject({
      status: "loading",
      busy: false,
    });
  });
});
