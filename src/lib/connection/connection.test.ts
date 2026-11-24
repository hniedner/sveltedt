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
