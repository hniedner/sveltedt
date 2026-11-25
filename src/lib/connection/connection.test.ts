import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import Probe from "../../../test/ConnectionProbe.svelte";
import type {
  Connection,
  ConnectionColumn,
  ConnectionJsonOptions,
  ConnectionOptions,
  ConnectionParamsOptions,
  ConnectionQuery,
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

// Renders the probe with the options `make` builds around a `send` that records its calls, each settled only by
// `answer`, and an `onerror` that records its calls; `connection` is what the helper returned
function run<Send>(
  makeSend: (pending: () => Promise<unknown>) => Send,
  make: (
    send: Send,
    onerror: ConnectionOptions["onerror"],
  ) => ConnectionOptions,
) {
  const settle: {
    resolve: (body: unknown) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  const send = makeSend(
    () => new Promise((resolve, reject) => settle.push({ resolve, reject })),
  );
  const onerror = vi.fn<ConnectionOptions["onerror"]>();
  let connected: Connection<Row> | undefined;
  const { unmount } = render(Probe, {
    options: make(send, onerror),
    onconnect: (connection: Connection<Row>) => (connected = connection),
  });
  return {
    send,
    onerror,
    unmount,
    // Settles the call of `send` with index `n` with `body`, then lets the probe update
    answer: async (n: number, body: unknown) => {
      settle[n]?.resolve(body);
      await tick();
    },
    // Rejects call `n` with `reason`, then lets the probe update
    fail: async (n: number, reason: unknown) => {
      settle[n]?.reject(reason);
      await tick();
    },
    get connection(): Connection<Row> {
      if (connected === undefined)
        throw new Error("the probe gave no connection");
      return connected;
    },
  };
}
function mount(options: Partial<ConnectionParamsOptions> = {}) {
  return run(
    (pending) => vi.fn<ConnectionParamsOptions["send"]>(pending),
    (send, onerror) => ({ send, onerror, columns: M, query: Q0, ...options }),
  );
}
// As `mount`, for the JSON form: `send` receives the plain object
function mountJson(options: Partial<ConnectionJsonOptions> = {}) {
  return run(
    (pending) => vi.fn<ConnectionJsonOptions["send"]>(pending),
    (send, onerror) => ({
      form: "json",
      send,
      onerror,
      columns: M,
      query: Q0,
      ...options,
    }),
  );
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
  const rows: [string, Partial<ConnectionParamsOptions>, [string, string][]][] =
    [
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

// @spec("CONN-05", "eeaee859")
describe("CONN-05", () => {
  const rows: [string, string][] = [
    ["columns[0][data]", "columns[0].data"],
    ["columns[0][search][value]", "columns[0].search.value"],
    ["order[0][column]", "order[0].column"],
    ["search[value]", "search.value"],
    ["draw", "draw"],
  ];
  it.each(rows)("sends the value of %s under %s", (bracketed, dotted) => {
    const sent = mount({ form: "dotted" }).send.mock.calls[0]?.[0]?.request;
    const reference = mount().send.mock.calls[0]?.[0]?.request;
    expect(reference?.get(bracketed)).not.toBeNull();
    expect(sent?.get(dotted)).toBe(reference?.get(bracketed));
  });
  it("sends no bracketed key with an object key in brackets", () => {
    const keys = [
      ...(mount({ form: "dotted" }).send.mock.calls[0]?.[0]?.request.keys() ??
        []),
    ];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => /\[[^\d\]]/.test(key))).toEqual([]);
  });
  it("sends no key starting with order for the sort []", () => {
    const { send } = mount({ form: "dotted", query: { sort: [], limit: 10 } });
    const request = send.mock.calls[0]?.[0]?.request;
    expect(request?.get("draw")).toBe("1");
    expect(orderOf(request)).toEqual({});
  });
});

// @spec("CONN-06", "fb038033")
describe("CONN-06", () => {
  const fixed = { value: "", regex: false };
  const entry = (data: string, name: string) => ({
    data,
    name,
    searchable: true,
    orderable: true,
    search: fixed,
  });
  const rows: [string, Partial<ConnectionJsonOptions>, object][] = [
    [
      "M, Q0",
      {},
      {
        draw: 1,
        start: 0,
        length: 10,
        search: fixed,
        columns: [entry("name", "n"), entry("code", "c"), entry("status", "s")],
        order: [{ column: 0, dir: "asc", name: "n" }],
      },
    ],
    [
      "the sort []",
      { query: { sort: [], limit: 10 } },
      {
        draw: 1,
        start: 0,
        length: 10,
        search: fixed,
        columns: [entry("name", "n"), entry("code", "c"), entry("status", "s")],
        order: [],
      },
    ],
    [
      "offset 20 and limit 25",
      { query: { sort: Q0.sort ?? [], offset: 20, limit: 25 } },
      {
        draw: 1,
        start: 20,
        length: 25,
        search: fixed,
        columns: [entry("name", "n"), entry("code", "c"), entry("status", "s")],
        order: [{ column: 0, dir: "asc", name: "n" }],
      },
    ],
  ];
  it.each(rows)("sends the plain object of %s", (_row, options, expected) => {
    const { send } = mountJson(options);
    expect(send.mock.calls[0]?.[0]?.request).toStrictEqual(expected);
  });
  it("gives each request objects of its own, so an application that edits one changes no other", async () => {
    const { send, answer, connection } = mountJson();
    const first = send.mock.calls[0]?.[0]?.request;
    (first?.search as { value: string }).value = "edited";
    (first?.columns[0]?.search as { value: string }).value = "edited";
    await answer(0, A1());
    connection.reload();
    const second = send.mock.calls[1]?.[0]?.request;
    expect(second?.search.value).toBe("");
    expect(second?.columns[0]?.search.value).toBe("");
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

// @spec("CONN-27", "ffb7e3c2")
describe("CONN-27", () => {
  const rows: [number, number, number, number, number][] = [
    // the offset and limit before, the size asked, the start sent, the offset the pager shows
    [20, 10, 25, 0, 0],
    [60, 10, 25, 50, 50],
    [50, 25, 10, 50, 50],
  ];
  it.each(rows)(
    "sends one request on pager.onsize from offset %i, limit %i, to size %i: start %i, the pager at offset %i before it is settled",
    async (offset, limit, size, start, shown) => {
      const probe = mount({ query: { ...Q0, offset, limit } });
      await probe.answer(0, A1());
      probe.connection.pager?.onsize(size);
      expect(probe.send).toHaveBeenCalledTimes(2);
      const request = probe.send.mock.calls[1]?.[0]?.request;
      expect(request?.get("start")).toBe(String(start));
      expect(request?.get("length")).toBe(String(size));
      expect(probe.connection.pager).toMatchObject({
        offset: shown,
        limit: size,
      });
    },
  );
});

// The pairs of a request without its draw
const withoutDraw = (request: URLSearchParams | undefined) =>
  [...(request ?? [])].filter(([key]) => key !== "draw");

// @spec("CONN-24", "1938413e")
describe("CONN-24", () => {
  const unmapped = A1({ recordsFiltered: "5x" });
  const rows: [
    string,
    (probe: ReturnType<typeof mount>) => Promise<void>,
    string,
    number,
  ][] = [
    // the settles before `reload()`, the draw it sends, the request whose other pairs it repeats
    ["A1", (probe) => probe.answer(0, A1()), "2", 0],
    [
      "request 1 answered by an answer it cannot map",
      (probe) => probe.answer(0, unmapped),
      "2",
      0,
    ],
    [
      "A1, then pager.onpage(10) answered by an answer it cannot map",
      async (probe) => {
        await probe.answer(0, A1());
        probe.connection.pager?.onpage(10);
        await probe.answer(1, { ...unmapped, draw: 2 });
      },
      "3",
      1,
    ],
  ];
  it.each(rows)(
    "sends the current query again with the next draw after %s",
    async (_row, settle, draw, same) => {
      const probe = mount();
      await settle(probe);
      const before = probe.send.mock.calls.length;
      probe.connection.reload();
      expect(probe.send).toHaveBeenCalledTimes(before + 1);
      const request = probe.send.mock.calls[before]?.[0]?.request;
      expect(request?.get("draw")).toBe(draw);
      expect(withoutDraw(request)).toEqual(
        withoutDraw(probe.send.mock.calls[same]?.[0]?.request),
      );
    },
  );
});

// The map M without entry 1's `id`, so that no entry serves `code`
const MNoCode: ConnectionColumn[] = M.map((column, i) =>
  i === 1 ? { data: column.data, name: column.name } : column,
);
const codeAsc = { id: "code", direction: "asc" } as const;
const nameAsc = { id: "name", direction: "asc" } as const;
// The messages of the Errors `onerror` received
const messages = (probe: ReturnType<typeof mount>) =>
  probe.onerror.mock.calls.map(([error]) =>
    error instanceof Error ? error.message : error,
  );

// @spec("CONN-16", "9f71fc39")
describe("CONN-16", () => {
  it("sends nothing and keeps the sort, naming code once, on table.onsort([code asc])", async () => {
    const probe = mount({
      columns: MNoCode,
      query: { ...Q0, offset: 20 },
    });
    await probe.answer(0, A1());
    probe.connection.table.onsort([codeAsc]);
    expect(probe.send).toHaveBeenCalledTimes(1);
    expect(probe.connection.table.sort).toEqual([nameAsc]);
    expect(probe.connection.pager?.offset).toBe(20);
    expect(messages(probe)).toEqual([expect.stringContaining("code")]);
  });
  it("sends nothing, keeps the sort, fails and names code once on a mount with sort [code asc]", () => {
    const probe = mount({
      columns: MNoCode,
      query: { ...Q0, sort: [codeAsc] },
    });
    expect(probe.send).not.toHaveBeenCalled();
    expect(probe.connection.table.sort).toEqual([codeAsc]);
    expect(probe.connection.table.status).toBe("failed");
    expect(messages(probe)).toEqual([expect.stringContaining("code")]);
  });
  it("sends nothing and names code once more on reload() after that mount", () => {
    const probe = mount({
      columns: MNoCode,
      query: { ...Q0, sort: [codeAsc] },
    });
    probe.connection.reload();
    expect(probe.send).not.toHaveBeenCalled();
    expect(probe.connection.table.sort).toEqual([codeAsc]);
    expect(messages(probe)).toEqual([
      expect.stringContaining("code"),
      expect.stringContaining("code"),
    ]);
  });
  it("sends nothing and calls onerror once on a mount with a sort entry without an id", () => {
    const sort = [{ direction: "asc" }] as unknown as ConnectionQuery["sort"];
    const probe = mount({ columns: MNoCode, query: { ...Q0, sort } });
    expect(probe.send).not.toHaveBeenCalled();
    expect(probe.connection.table.sort).toEqual(sort);
    expect(probe.connection.table.status).toBe("failed");
    expect(probe.onerror).toHaveBeenCalledTimes(1);
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
  it("counts a sort, a reload and a size change, none answered, as draw 2, 3 and 4 after A1", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.table.onsort([{ id: "code", direction: "desc" }]);
    probe.connection.reload();
    probe.connection.pager?.onsize(25);
    expect(
      probe.send.mock.calls.map(([{ request }]) => request.get("draw")),
    ).toEqual(["1", "2", "3", "4"]);
  });
  it("counts only the requests sent: refusals take no draw", async () => {
    const probe = mount({
      columns: MNoCode,
      query: { ...Q0, sort: [codeAsc] },
    });
    probe.connection.reload();
    probe.connection.table.onsort([nameAsc]);
    expect(probe.send).toHaveBeenCalledTimes(1);
    expect(probe.send.mock.calls[0]?.[0]?.request.get("draw")).toBe("1");
    await probe.answer(0, A1());
    probe.connection.table.onsort([codeAsc]);
    probe.connection.reload();
    expect(probe.send).toHaveBeenCalledTimes(2);
    expect(probe.send.mock.calls[1]?.[0]?.request.get("draw")).toBe("2");
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
const failed = (rows: unknown, reason: string) => ({
  status: "failed",
  busy: false,
  rows,
  errors: [`The answer does not match the request: ${reason}.`],
});
// A revoked Proxy of a list: Array.isArray throws on it
const revoked = () => {
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();
  return proxy;
};

// @spec("CONN-18", "bfeb6c04")
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
  const rows: [string, unknown, string][] = [
    ["null", null, "it is not an object"],
    ["'ok'", "ok", "it is not an object"],
    ["undefined", undefined, "it is not an object"],
    ["[]", [], "data is not a list"],
    [
      "A1 without recordsTotal",
      A1without("recordsTotal"),
      "recordsTotal is not a count",
    ],
    [
      "A1 without recordsFiltered",
      A1without("recordsFiltered"),
      "recordsFiltered is not a count",
    ],
    ["A1 without data", A1without("data"), "data is not a list"],
    ...["recordsFiltered", "recordsTotal"].flatMap(
      (field): [string, Body, string][] =>
        badCounts.map((count) => [
          `A1 with ${field} ${JSON.stringify(count)}`,
          A1({ [field]: count }),
          `${field} is not a count`,
        ]),
    ),
    ["A1 with data {}", A1({ data: {} }), "data is not a list"],
    [
      "A1 without data and with both counts bad",
      A1({ data: undefined, recordsFiltered: -1, recordsTotal: -1 }),
      "data is not a list",
    ],
    [
      "A1 with both counts bad",
      A1({ recordsFiltered: -1, recordsTotal: -1 }),
      "recordsFiltered is not a count",
    ],
    [
      "A1 with recordsTotal bad and draw 2",
      A1({ recordsTotal: -1, draw: 2 }),
      "recordsTotal is not a count",
    ],
    [
      "A1 whose data is a revoked Proxy and recordsTotal bad",
      A1({ data: revoked(), recordsTotal: -1 }),
      "it cannot be read",
    ],
    ...[2, "2", null, "1a", " 1", "1e0", "+1", "1.0", [1]].map(
      (draw): [string, Body, string] => [
        `A1 with draw ${JSON.stringify(draw)}`,
        A1({ draw }),
        "draw is not the one sent",
      ],
    ),
    [
      "A1 whose recordsTotal getter throws",
      Object.defineProperty(A1(), "recordsTotal", {
        get() {
          throw new Error("getter leak-12");
        },
      }),
      "it cannot be read",
    ],
    [
      "A1 whose data is a revoked Proxy",
      A1({ data: revoked() }),
      "it cannot be read",
    ],
  ];
  it.each(rows)("fails on %s", async (_row, body, reason) => {
    const probe = mount();
    await probe.answer(0, body);
    expect(outcome(probe)).toEqual(failed([], reason));
    expect((probe.onerror.mock.calls[0]?.[0] as Error).cause).toBeUndefined();
  });
  it("fails the second request answered without data, not busy", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    await probe.answer(1, { ...A1without("data"), draw: 2 });
    expect(outcome(probe)).toEqual(failed(D, "data is not a list"));
  });
  it("fails an answer of the first request's draw to the second request, the rows kept", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    expect(probe.send.mock.calls[1]?.[0].request.get("draw")).toBe("2");
    await probe.answer(1, A1());
    expect(outcome(probe)).toEqual(failed(D, "draw is not the one sent"));
  });
});

const REPORTED = "The answer reports an error.";

// @spec("CONN-19", "47703f94")
describe("CONN-19", () => {
  const rows: [string, unknown][] = [
    ["A1 with error 'SQL near WHERE'", A1({ error: "SQL near WHERE" })],
    ["A1 with error true", A1({ error: true })],
    [
      "an answer of 0 rows with error and error_code",
      {
        draw: 1,
        recordsTotal: 0,
        recordsFiltered: 0,
        data: [],
        error: "x",
        error_code: "invalid_filter",
      },
    ],
    ["{ error: 'x' } alone", { error: "x" }],
  ];
  it.each(rows)("fails on %s, with the fixed message", async (_row, body) => {
    const probe = mount();
    await probe.answer(0, body);
    expect(outcome(probe)).toEqual({
      status: "failed",
      busy: false,
      rows: [],
      errors: [REPORTED],
    });
  });
});

// @spec("CONN-21", "0e5b5709")
describe("CONN-21", () => {
  const rows: [string, unknown, string | null][] = [
    [
      "A1 with error and error_code 'TIMEOUT'",
      A1({ error: "x", error_code: "TIMEOUT" }),
      "TIMEOUT",
    ],
    [
      "A1 with error and error_code 42",
      A1({ error: "x", error_code: 42 }),
      null,
    ],
    ["A1 with error and no error_code", A1({ error: "x" }), null],
    [
      "A1 without recordsTotal, with error_code 'TIMEOUT'",
      { ...A1without("recordsTotal"), error_code: "TIMEOUT" },
      "TIMEOUT",
    ],
    [
      "A1 without data, with error_code 'TIMEOUT'",
      { ...A1without("data"), error_code: "TIMEOUT" },
      "TIMEOUT",
    ],
    [
      "A1 without recordsFiltered, with error_code 'TIMEOUT'",
      { ...A1without("recordsFiltered"), error_code: "TIMEOUT" },
      "TIMEOUT",
    ],
    [
      "A1 with draw 2, with error_code 'TIMEOUT'",
      A1({ draw: 2, error_code: "TIMEOUT" }),
      "TIMEOUT",
    ],
    ["{ error: 'x' } alone", { error: "x" }, null],
  ];
  it.each(rows)("carries the code of %s", async (_row, body, code) => {
    const probe = mount();
    await probe.answer(0, body);
    expect(probe.onerror).toHaveBeenCalledTimes(1);
    expect(probe.onerror.mock.calls[0]?.[0]).toHaveProperty("code", code);
  });
});

// @spec("CONN-26", "4467a69c")
describe("CONN-26", () => {
  const rows: [string, unknown, string][] = [
    [
      "A1 with error 'SQL near WHERE'",
      A1({ error: "SQL near WHERE" }),
      "SQL near WHERE",
    ],
    [
      "A1 with error true and a row holding leak-41",
      A1({ error: true, data: [{ id: "x1", name: "leak-41" }] }),
      "leak-41",
    ],
    [
      "A1 with error and error_code invalid_filter",
      A1({ error: "x", error_code: "invalid_filter" }),
      "invalid_filter",
    ],
  ];
  it.each(rows)(
    "shows the failed text, not the text of %s",
    async (_row, body, text) => {
      const probe = mount();
      await probe.answer(0, body);
      expect(document.body.textContent).toContain(
        "The data could not be loaded.",
      );
      expect(document.body.textContent).not.toContain(text);
    },
  );
});

// What a failure of `send` leaves: the state, and the exact values `onerror` received
const sendFailure = (probe: ReturnType<typeof mount>) => ({
  status: probe.connection.table.status,
  busy: probe.connection.table.busy,
  errors: probe.onerror.mock.calls.map(([error]) => error),
});

// @spec("CONN-20", "728d9b5d")
describe("CONN-20", () => {
  const E = new Error("boom");
  it("shows the failed message and nothing of the rejection's text", async () => {
    const probe = mount();
    await probe.fail(0, new Error("boom: row 7"));
    expect(document.body.textContent).toContain(
      "The data could not be loaded.",
    );
    expect(document.body.textContent).not.toContain("boom");
    expect(document.body.textContent).not.toContain("row 7");
  });
  it("fails with the rejection itself when send rejects", async () => {
    const probe = mount();
    await probe.fail(0, E);
    const { errors, ...state } = sendFailure(probe);
    expect(state).toEqual({ status: "failed", busy: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(E);
  });
  it("fails with the error itself when send throws", () => {
    const probe = mount({
      send: vi.fn(() => {
        throw E;
      }),
    });
    const { errors, ...state } = sendFailure(probe);
    expect(state).toEqual({ status: "failed", busy: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(E);
  });
  it("fails the second request when its send rejects, keeping the sort and the rows", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.table.onsort([{ id: "code", direction: "desc" }]);
    expect(probe.connection.table.busy).toBe(true);
    await probe.fail(1, E);
    expect(probe.connection.table.status).toBe("failed");
    expect(probe.connection.table.busy).toBe(false);
    expect(probe.connection.table.sort).toEqual([
      { id: "code", direction: "desc" },
    ]);
    expect(probe.connection.table.rows).toBe(D);
    expect(probe.onerror).toHaveBeenCalledTimes(1);
    expect(probe.onerror.mock.calls[0]?.[0]).toBe(E);
  });
  it("fails with a TypeError when send returns no promise", () => {
    const probe = mount({
      send: (() => undefined) as unknown as ConnectionParamsOptions["send"],
    });
    const { errors, ...state } = sendFailure(probe);
    expect(state).toEqual({ status: "failed", busy: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
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

// @spec("CONN-22", "a1cab22e")
describe("CONN-22", () => {
  const desc = [{ id: "code", direction: "desc" as const }];
  const D2 = D.map((row) => ({ ...row, name: `Other ${row.id}` }));
  it("drops the answer of a request that onsort superseded", async () => {
    const probe = mount();
    probe.connection.table.onsort(desc);
    await probe.answer(0, A1());
    expect(probe.connection.table.status).toBe("loading");
    expect(probe.connection.table.rows).toEqual([]);
    expect(probe.onerror).not.toHaveBeenCalled();
  });
  it("drops the rejection of a request that reload superseded", async () => {
    const probe = mount();
    probe.connection.reload();
    await probe.fail(0, new Error("boom"));
    expect(probe.connection.table.status).toBe("loading");
    expect(probe.onerror).not.toHaveBeenCalled();
  });
  it("keeps the later answer when the superseded one settles after it", async () => {
    const probe = mount();
    probe.connection.table.onsort(desc);
    await probe.answer(1, A1({ draw: 2, data: D2 }));
    await probe.answer(0, A1());
    expect(probe.connection.table.rows).toBe(D2);
    expect(probe.connection.pager).toMatchObject({
      total: 57,
      unfilteredTotal: 1000,
    });
    expect(probe.onerror).not.toHaveBeenCalled();
  });
  it("drops the rejection of the onpage(10) request (draw 2), the rows kept and busy", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    probe.connection.pager?.onpage(20);
    await probe.fail(1, new Error("boom"));
    expect(probe.connection.table).toMatchObject({
      status: "ready",
      busy: true,
    });
    expect(probe.connection.table.rows).toBe(D);
    expect(probe.onerror).not.toHaveBeenCalled();
  });
});

// The signal the helper passed to call `n` of `send`
const signalOf = (probe: ReturnType<typeof mount>, n: number) =>
  probe.send.mock.calls[n]?.[0].signal;

// @spec("CONN-30", "24c82141")
describe("CONN-30", () => {
  const E = new Error("boom");
  it("aborts the running request when the component unmounts", () => {
    const probe = mount();
    probe.unmount();
    expect(signalOf(probe, 0)?.aborted).toBe(true);
    expect(probe.send).toHaveBeenCalledTimes(1);
  });
  it("does not abort a request that settled when a later one is sent", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    expect(signalOf(probe, 0)?.aborted).toBe(false);
    expect(signalOf(probe, 1)?.aborted).toBe(false);
  });
  it("aborts only the running request when the component unmounts after a settled one", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    probe.unmount();
    expect(signalOf(probe, 0)?.aborted).toBe(false);
    expect(signalOf(probe, 1)?.aborted).toBe(true);
  });
  it.each([
    [
      "onsort",
      (p: ReturnType<typeof mount>) =>
        p.connection.table.onsort([{ id: "code", direction: "desc" }]),
    ],
    ["onpage", (p: ReturnType<typeof mount>) => p.connection.pager?.onpage(10)],
    ["onsize", (p: ReturnType<typeof mount>) => p.connection.pager?.onsize(25)],
    ["reload", (p: ReturnType<typeof mount>) => p.connection.reload()],
  ])(
    "aborts the running request when %s sends a later one",
    async (name, act) => {
      const probe = mount();
      // onpage and onsize exist only once an answer is mapped; that request is then settled and keeps its signal
      if (name === "onpage" || name === "onsize") {
        await probe.answer(0, A1());
        act(probe);
        expect(signalOf(probe, 1)?.aborted).toBe(false);
        act(probe);
        expect(signalOf(probe, 1)?.aborted).toBe(true);
        expect(signalOf(probe, 2)?.aborted).toBe(false);
        return;
      }
      act(probe);
      expect(signalOf(probe, 0)?.aborted).toBe(true);
      expect(signalOf(probe, 1)?.aborted).toBe(false);
    },
  );
  it("starts a new request after a failure without aborting anything", async () => {
    const probe = mount();
    await probe.fail(0, E);
    probe.connection.reload();
    expect(signalOf(probe, 0)?.aborted).toBe(false);
    expect(signalOf(probe, 1)?.aborted).toBe(false);
  });
  it("starts a new request after an unreadable answer without aborting anything", async () => {
    const probe = mount();
    await probe.answer(0, null);
    probe.connection.reload();
    expect(signalOf(probe, 0)?.aborted).toBe(false);
    expect(signalOf(probe, 1)?.aborted).toBe(false);
  });
  it("aborts nothing when the component unmounts after a failure", async () => {
    const probe = mount();
    await probe.fail(0, E);
    probe.unmount();
    expect(signalOf(probe, 0)?.aborted).toBe(false);
  });
  it("aborts nothing when a refused sort sends nothing", () => {
    const probe = mount({ columns: M.filter((entry) => entry.id !== "code") });
    probe.connection.table.onsort([{ id: "code", direction: "asc" }]);
    expect(signalOf(probe, 0)?.aborted).toBe(false);
    expect(probe.send).toHaveBeenCalledTimes(1);
  });
});

// @spec("CONN-31", "28e8f104")
describe("CONN-31", () => {
  it("ignores the AbortError rejection of the request running at unmount", async () => {
    const probe = mount();
    probe.unmount();
    await probe.fail(0, new DOMException("aborted", "AbortError"));
    expect(probe.connection.table.status).toBe("loading");
    expect(probe.connection.pager).toBeUndefined();
    expect(probe.onerror).not.toHaveBeenCalled();
  });
  it("ignores any rejection of the request running at unmount", async () => {
    const probe = mount();
    probe.unmount();
    await probe.fail(0, new Error("net"));
    expect(probe.connection.table.status).toBe("loading");
    expect(probe.onerror).not.toHaveBeenCalled();
  });
  it("ignores the answer of the request running at unmount", async () => {
    const probe = mount();
    probe.unmount();
    await probe.answer(0, A1());
    expect(probe.connection.table.status).toBe("loading");
    expect(probe.connection.table.rows).toEqual([]);
    expect(probe.connection.pager).toBeUndefined();
    expect(probe.onerror).not.toHaveBeenCalled();
  });
  it("ignores an answer it cannot map after unmount, the rows kept and busy", async () => {
    const probe = mount();
    await probe.answer(0, A1());
    probe.connection.pager?.onpage(10);
    probe.unmount();
    await probe.answer(1, null);
    expect(probe.connection.table).toMatchObject({
      status: "ready",
      busy: true,
    });
    expect(probe.connection.table.rows).toBe(D);
    expect(probe.onerror).not.toHaveBeenCalled();
  });
});
