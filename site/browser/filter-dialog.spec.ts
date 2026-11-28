// The statements of the filter dialog and its fields (spec/table.md section 11), against site/filter-dialog.html. The
// dialog is a popover, and an empty popover has no box, so a test counts the dialog by its role and name and never asks
// whether it is visible.
import { expect, test, type Locator, type Page } from "@playwright/test";

type DialogWindow = Window & {
  __calls: { onfilter: unknown[] };
  __table: { set(props: object): void };
};

const START = new Date("2026-01-01T00:00:00Z");

// The `onfilter` argument of a column's text field, as the page recorded it
const text = (id: string, value: string) => ({
  id,
  state: { kind: "text", text: value },
});

// Replaces the filters the application has applied, as a changed `filters` prop does
async function setFilters(page: Page, filters: object) {
  await page.evaluate(
    (next) =>
      (window as unknown as DialogWindow).__table.set({ filters: next }),
    filters,
  );
}

// Waits until the table shows Name's applied text as a badge: the echo has arrived, so a field is read after it
async function echoed(page: Page, applied: string) {
  await expect(
    page.getByRole("button", {
      name: `Clear filter Name: contains “${applied}”`,
      exact: true,
    }),
    "could not check: the echo did not arrive",
  ).toHaveCount(1);
}

// Opens the dialog of "Filter <label>" on the page, `address` setting `searchDelay` and the like, with the clock paused
// at the start: page time moves only by `at`, so "400 ms" is exact. `filters` is what the application has applied.
// Returns the dialog, `at(ms)` that moves the clock to `ms` after the dialog opened (keys take no time), and
// `calls()` that reads every `onfilter` argument so far
async function openDialog(
  page: Page,
  label: string,
  address = "/filter-dialog.html",
  filters = {},
) {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(new Date(START.getTime() + 1000));
  await page.goto(address);
  await setFilters(page, filters);
  await page
    .getByRole("button", { name: `Filter ${label}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: `${label} filter`,
    exact: true,
  });
  await expect(
    dialog,
    `could not check: ${label}'s dialog did not open`,
  ).toHaveCount(1);
  let elapsed = 0;
  const at = async (ms: number) => {
    await page.clock.runFor(ms - elapsed);
    elapsed = ms;
  };
  const calls = () =>
    page.evaluate(() => (window as unknown as DialogWindow).__calls.onfilter);
  expect(await calls(), "could not check: a call before any input").toEqual([]);
  return { dialog, at, calls };
}

// The dialog of "Filter Name", with its field "Filter Name text"
async function openName(
  page: Page,
  address = "/filter-dialog.html",
  filters = {},
) {
  const { dialog, at, calls } = await openDialog(
    page,
    "Name",
    address,
    filters,
  );
  const field = dialog.getByLabel("Filter Name text");
  await expect(
    field,
    "could not check: Name's dialog holds no field",
  ).toHaveCount(1);
  return { field, at, calls };
}

// As openName, with "beta" applied to Name: the field must hold it before a test goes on
async function openNameApplied(page: Page) {
  const opened = await openName(page, undefined, {
    name: { kind: "text", text: "beta" },
  });
  await expect(
    opened.field,
    "could not check: the field lacks the applied text",
  ).toHaveValue("beta");
  return opened;
}

// @spec("FILT-02", "70479fab")
test.describe("FILT-02, a press on a filter button opens one named dialog", () => {
  for (const [label, name] of [
    ["Name", "Name filter"],
    ["Status", "Status filter"],
  ] as const)
    test(`Filter ${label}`, async ({ page }) => {
      await page.goto("/filter-dialog.html");
      const dialog = page.getByRole("dialog", { name, exact: true });
      // Precondition: no dialog is open before the press, so a count of 1 after it is the press's doing
      await expect(
        dialog,
        "could not check: a dialog is open before the press",
      ).toHaveCount(0);
      await page.getByRole("button", { name: `Filter ${label}` }).click();
      await expect(dialog).toHaveCount(1);
      await expect(page.getByRole("dialog")).toHaveCount(1);
    });
});

// @spec("FILT-01", "1ad86d58")
test.describe("FILT-01, a text filter emits once typing pauses", () => {
  test("type beta; at 399 ms none", async ({ page }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("beta");
    await at(399);
    expect(await calls()).toEqual([]);
  });

  test("type beta; at 400 ms one call", async ({ page }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("beta");
    await at(400);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("type be, at 300 ms ta; at 699 ms none, at 700 ms one", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("be");
    await at(300);
    await field.pressSequentially("ta");
    await at(699);
    expect(await calls()).toEqual([]);
    await at(700);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("searchDelay 1000: none at 999 ms, one at 1000 ms", async ({ page }) => {
    const { field, at, calls } = await openName(
      page,
      "/filter-dialog.html?delay=1000",
    );
    await field.pressSequentially("beta");
    await at(999);
    expect(await calls()).toEqual([]);
    await at(1000);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("searchDelay 0: one call at each key", async ({ page }) => {
    const { field, calls } = await openName(
      page,
      "/filter-dialog.html?delay=0",
    );
    const seen: unknown[] = [];
    for (const [index, key] of [..."beta"].entries()) {
      await field.pressSequentially(key);
      seen.push(text("name", "beta".slice(0, index + 1)));
      expect(await calls()).toEqual(seen);
    }
  });

  test("the text already applied: type x, Backspace; at 400 ms none", async ({
    page,
  }) => {
    const { field, at, calls } = await openNameApplied(page);
    await field.pressSequentially("x");
    await field.press("Backspace");
    await at(400);
    expect(await calls()).toEqual([]);
  });
});

// @spec("FILT-27", "5eb3ec59")
test.describe("FILT-27, Enter in a text filter's field emits at once", () => {
  test("type beta; at 100 ms Enter: one call, still one at 600 ms", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("beta");
    await at(100);
    expect(await calls()).toEqual([]);
    await field.press("Enter");
    expect(await calls()).toEqual([text("name", "beta")]);
    await at(600);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("the text already applied: Enter emits none", async ({ page }) => {
    const { field, calls } = await openNameApplied(page);
    await field.press("Enter");
    expect(await calls()).toEqual([]);
  });
});

// @spec("FILT-28", "e81fa6c6")
test.describe("FILT-28, with searchOnEnter a text filter emits only on Enter", () => {
  test("type beta; at 1000 ms no call; Enter: one call", async ({ page }) => {
    const { field, at, calls } = await openName(
      page,
      "/filter-dialog.html?enter",
    );
    await field.pressSequentially("beta");
    await at(1000);
    expect(await calls()).toEqual([]);
    await field.press("Enter");
    expect(await calls()).toEqual([text("name", "beta")]);
  });
});

// @spec("FILT-14", "d75ab885")
test("FILT-14, a text filter's field has autocomplete off", async ({
  page,
}) => {
  const { field } = await openName(page);
  await expect(field).toHaveAttribute("autocomplete", "off");
});

// Puts `value` into the field with one paste from the clipboard, as a user's paste does, and checks the engine kept
// every character. Not `insertText` or `fill`: Firefox drops U+0001 and U+007F from both. Chromium refuses a clipboard
// write without a grant; Firefox and WebKit throw on that grant, so only Chromium gets it. Each engine keeps its own
// clipboard in a headless run (MEASURED on macOS), but a headed run may overwrite the developer's own clipboard: run
// headless to keep it. The per-row check at the end stays because Chromium's clipboard carries over between tests in
// one worker, so a failed write would paste the previous test's text
async function paste(page: Page, field: Locator, value: string) {
  const context = page.context();
  if (context.browser()?.browserType().name() === "chromium")
    await context.grantPermissions(["clipboard-write"]);
  await page.evaluate((text) => navigator.clipboard.writeText(text), value);
  await field.focus();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(
    field,
    "could not check: the engine dropped a pasted character",
  ).toHaveValue(value);
}

// Types " beta " into Name's field and lets the pause pass: FILT-59's first row, and where FILT-60 starts. Asserts the
// one call, with the text trimmed, and hands back what the test goes on with
async function typePaddedBeta(page: Page) {
  const opened = await openName(page);
  await opened.field.pressSequentially(" beta ");
  await opened.at(400);
  expect(await opened.calls()).toEqual([text("name", "beta")]);
  return opened;
}

// @spec("FILT-59", "b7f553dc")
test.describe("FILT-59, a text filter emits its text without outer white space", () => {
  test("type ' beta '; at 400 ms one call with beta", async ({ page }) => {
    await typePaddedBeta(page);
  });

  test("paste beta and a tab; at 400 ms one call with beta", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page);
    await paste(page, field, "beta\t");
    await at(400);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("beta applied; type a space; at 400 ms none", async ({ page }) => {
    const { field, at, calls } = await openNameApplied(page);
    await field.pressSequentially(" ");
    await at(400);
    expect(await calls()).toEqual([]);
  });

  test("beta applied; the field set to a space; at 400 ms one call with an empty text", async ({
    page,
  }) => {
    const { field, at, calls } = await openNameApplied(page);
    await field.fill(" ");
    await at(400);
    expect(await calls()).toEqual([text("name", "")]);
  });

  test("type ' beta '; at 100 ms Enter: one call with beta", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially(" beta ");
    await at(100);
    await field.press("Enter");
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("paste a quoted phrase; at 400 ms one call keeps its spaces", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page);
    await paste(page, field, '" beta "');
    await at(400);
    expect(await calls()).toEqual([text("name", '" beta "')]);
  });
});

// @spec("FILT-60", "74a3f411")
test("FILT-60, a filter field keeps typed white space when filters echoes the trimmed text", async ({
  page,
}) => {
  const { field, at } = await typePaddedBeta(page);
  await at(500);
  await setFilters(page, { name: { kind: "text", text: "beta" } });
  await echoed(page, "beta");
  await expect(field).toHaveValue(" beta ");
});

// Opens with "beta" applied, clicks into the field, types "x" and lets the pause pass: FILT-37's rows 4 to 6 start with
// the one call "betax". The click comes first because in Firefox and WebKit typing into a field that holds text puts the
// key at the start (measured: not even the End key moves it)
async function sentBetax(page: Page) {
  const opened = await openNameApplied(page);
  await opened.field.click();
  await opened.field.pressSequentially("x");
  await opened.at(400);
  expect(await opened.calls()).toEqual([text("name", "betax")]);
  return opened;
}

// @spec("FILT-37", "d417b14c")
test.describe("FILT-37, a text filter's field takes the applied text and keeps its own until it is sent", () => {
  test("beta applied; open the dialog: reads beta", async ({ page }) => {
    const { field } = await openName(page, undefined, {
      name: { kind: "text", text: "beta" },
    });
    await expect(field).toHaveValue("beta");
  });

  test("no filter for Name; open the dialog: reads an empty text", async ({
    page,
  }) => {
    const { field } = await openName(page);
    await expect(field).toHaveValue("");
  });

  test("beta applied, nothing typed; filters becomes gamma: reads gamma", async ({
    page,
  }) => {
    const { field } = await openNameApplied(page);
    await setFilters(page, { name: { kind: "text", text: "gamma" } });
    await echoed(page, "gamma");
    await expect(field).toHaveValue("gamma");
  });

  test("beta applied; type x; at 400 ms one call betax; at 450 ms filters unchanged: reads betax", async ({
    page,
  }) => {
    const { field, at } = await sentBetax(page);
    await at(450);
    await expect(field).toHaveValue("betax");
  });

  test("beta applied; type x; at 400 ms one call betax; at 500 ms filters becomes betax: reads betax", async ({
    page,
  }) => {
    const { field, at } = await sentBetax(page);
    await at(500);
    await setFilters(page, { name: { kind: "text", text: "betax" } });
    await echoed(page, "betax");
    await expect(field).toHaveValue("betax");
  });

  test("beta applied; type x; at 400 ms one call betax; at 500 ms filters becomes gamma: reads gamma", async ({
    page,
  }) => {
    const { field, at } = await sentBetax(page);
    await at(500);
    await setFilters(page, { name: { kind: "text", text: "gamma" } });
    await echoed(page, "gamma");
    await expect(field).toHaveValue("gamma");
  });
});

// @spec("FILT-05", "98b7be79")
test("FILT-05, a text filter's field keeps newer typing when filters changes", async ({
  page,
}) => {
  const { field, at, calls } = await openName(page);
  await field.pressSequentially("mel");
  await at(400);
  expect(await calls()).toEqual([text("name", "mel")]);
  await at(450);
  await field.click();
  await field.pressSequentially("anoma");
  await at(500);
  await setFilters(page, { name: { kind: "text", text: "mel" } });
  await echoed(page, "mel");
  await expect(field).toHaveValue("melanoma");
  await at(849);
  expect(await calls()).toHaveLength(1);
  await at(850);
  expect(await calls()).toEqual([
    text("name", "mel"),
    text("name", "melanoma"),
  ]);
});

// @spec("FILT-13", "69cb5f4e")
test.describe("FILT-13, under searchOnEnter a text filter's field says Press Enter to apply", () => {
  test("searchOnEnter true: the description contains the hint", async ({
    page,
  }) => {
    const { field } = await openName(page, "/filter-dialog.html?enter");
    await expect(field).toHaveAccessibleDescription(/Press Enter to apply\./);
  });

  test("searchOnEnter false: the description does not contain it", async ({
    page,
  }) => {
    const { field } = await openName(page);
    await expect(field).not.toHaveAccessibleDescription(
      /Press Enter to apply\./,
    );
  });
});

// How a row of FILT-03 or FILT-16 puts its text into the field, and the address of the page it runs on
interface Entry {
  title: string;
  value: string;
  pasted: boolean;
  address?: string;
}
const MAX_TEN = "/filter-dialog.html?max=10";
const REFUSED: Entry[] = [
  { title: "a, U+0001, b", value: "a\u0001b", pasted: true },
  { title: "a, U+007F", value: "a\u007f", pasted: true },
  { title: "a, U+0009, b", value: "a\tb", pasted: true },
  { title: "a, U+0085", value: "a\u0085", pasted: true },
  { title: "256 x", value: "x".repeat(256), pasted: false },
  { title: "256 U+1F600", value: "\u{1F600}".repeat(256), pasted: true },
  {
    title: "11 x, maxLength 10",
    value: "x".repeat(11),
    pasted: false,
    address: MAX_TEN,
  },
];
const ACCEPTED: (Entry & { sent: string })[] = [
  {
    title: "255 U+1F600",
    value: "\u{1F600}".repeat(255),
    sent: "\u{1F600}".repeat(255),
    pasted: true,
  },
  {
    title: "10 x, maxLength 10",
    value: "x".repeat(10),
    sent: "x".repeat(10),
    pasted: false,
    address: MAX_TEN,
  },
  {
    title: "255 x and a space",
    value: `${"x".repeat(255)} `,
    sent: "x".repeat(255),
    pasted: true,
  },
  { title: "beta, U+0009", value: "beta\t", sent: "beta", pasted: true },
];

// Puts the row's text into the field and checks it arrived whole
async function put(page: Page, field: Locator, entry: Entry) {
  if (entry.pasted) await paste(page, field, entry.value);
  else await field.pressSequentially(entry.value);
  await expect(field, "could not check: the text did not arrive").toHaveValue(
    entry.value,
  );
}

// @spec("FILT-03", "c2636ac6")
test.describe("FILT-03, a text filter emits nothing for text it refuses after trimming", () => {
  for (const entry of REFUSED)
    test(`${entry.title}: at 400 ms and on Enter no call`, async ({ page }) => {
      const { field, at, calls } = await openName(page, entry.address);
      // The user sees the refusal of FILT-15 instead of keys that do nothing
      await expect(field).not.toHaveAttribute("maxlength");
      await put(page, field, entry);
      await expect(
        field,
        "could not check: the text is not refused",
      ).toHaveAttribute("aria-invalid", "true");
      await at(400);
      await field.press("Enter");
      expect(await calls()).toEqual([]);
    });

  for (const entry of ACCEPTED)
    test(`${entry.title}: at 400 ms one call with the trimmed text`, async ({
      page,
    }) => {
      const { field, at, calls } = await openName(page, entry.address);
      await put(page, field, entry);
      await at(400);
      expect(await calls()).toEqual([text("name", entry.sent)]);
    });
});

const HIDDEN =
  "The text contains a hidden character, often from pasted text. Clear the field and type the text again.";
// One FILT-15 row: the field after the applied text, the paste and the typing, and the alerts it must show
interface Alerting {
  title: string;
  alerts: string[];
  applied?: string;
  pasted?: string;
  typed?: string;
  address?: string;
}
const REASONS: Alerting[] = [
  { title: "paste a, U+0001", pasted: "a\u0001", alerts: [HIDDEN] },
  { title: "paste a, U+0009, b", pasted: "a\tb", alerts: [HIDDEN] },
  { title: "paste a, U+0085", pasted: "a\u0085", alerts: [HIDDEN] },
  {
    title: "type 11 x, maxLength 10",
    typed: "x".repeat(11),
    address: MAX_TEN,
    alerts: ["Use at most 10 characters."],
  },
  {
    title: "paste a, U+0001, then type 300 x",
    pasted: "a\u0001",
    typed: "x".repeat(300),
    alerts: [HIDDEN, "Use at most 255 characters."],
  },
  {
    title: "open with a, U+0001 applied",
    applied: "a\u0001",
    alerts: [HIDDEN],
  },
  { title: "paste beta, U+0009: none", pasted: "beta\t", alerts: [] },
];

// @spec("FILT-15", "b19335cf")
test.describe("FILT-15, refused filter text is marked invalid with one alert per reason", () => {
  for (const row of REASONS)
    test(row.title, async ({ page }) => {
      const { field } = await openName(
        page,
        row.address,
        row.applied === undefined
          ? {}
          : { name: { kind: "text", text: row.applied } },
      );
      let value = row.applied ?? "";
      if (row.pasted !== undefined) {
        await paste(page, field, row.pasted);
        value = row.pasted;
      }
      if (row.typed !== undefined) {
        await field.pressSequentially(row.typed);
        value += row.typed;
      }
      await expect(
        field,
        "could not check: the text did not arrive",
      ).toHaveValue(value);
      const invalid = expect(field);
      if (row.alerts.length)
        await invalid.toHaveAttribute("aria-invalid", "true");
      else await invalid.not.toHaveAttribute("aria-invalid", "true");
      const dialog = page.getByRole("dialog", {
        name: "Name filter",
        exact: true,
      });
      await expect(dialog.getByRole("alert")).toHaveText(row.alerts);
      await expect(field).toHaveAccessibleDescription(row.alerts.join(" "));
    });
});

// @spec("FILT-16", "4e99d60e")
test.describe("FILT-16, a key that makes the filter text valid removes the mark and alerts", () => {
  const rows: (Entry & { reads: string; sent: string })[] = [
    {
      title: "paste a, U+0001",
      value: "a\u0001",
      pasted: true,
      reads: "a",
      sent: "a",
    },
    {
      title: "paste a, U+0009, b",
      value: "a\tb",
      pasted: true,
      reads: "a\t",
      sent: "a",
    },
    {
      title: "type 11 x, maxLength 10",
      value: "x".repeat(11),
      pasted: false,
      address: MAX_TEN,
      reads: "x".repeat(10),
      sent: "x".repeat(10),
    },
  ];
  for (const row of rows)
    test(`${row.title}, then Backspace`, async ({ page }) => {
      const { field, at, calls } = await openName(page, row.address);
      const alerts = page
        .getByRole("dialog", { name: "Name filter", exact: true })
        .getByRole("alert");
      await put(page, field, row);
      // The text is refused before the key, so the key is what clears the mark
      await expect(
        field,
        "could not check: the text is not refused",
      ).toHaveAttribute("aria-invalid", "true");
      await expect(
        alerts,
        "could not check: no alert before the key",
      ).toHaveCount(1);
      await field.press("Backspace");
      await expect(field).toHaveValue(row.reads);
      await expect(field).not.toHaveAttribute("aria-invalid", "true");
      await expect(alerts).toHaveCount(0);
      await at(400);
      expect(await calls()).toEqual([text("name", row.sent)]);
    });
});

// @spec("FILT-17", "4a8b17f8")
test.describe("FILT-17, a categorical filter offers its options as checkboxes that show the selection `filters` holds", () => {
  const selected = (...values: string[]) => ({
    status: { kind: "categorical", selected: values },
  });

  test("selected inactive: Active not checked, Inactive checked, in that order, no other", async ({
    page,
  }) => {
    const { dialog } = await openDialog(
      page,
      "Status",
      undefined,
      selected("inactive"),
    );
    const boxes = dialog.getByRole("checkbox");
    await expect(boxes).toHaveCount(2);
    await expect(boxes.nth(0)).toHaveAccessibleName(/^Active$/);
    await expect(boxes.nth(0)).not.toBeChecked();
    await expect(boxes.nth(1)).toHaveAccessibleName(/^Inactive$/);
    await expect(boxes.nth(1)).toBeChecked();
  });

  test("with no press, filters becoming active and inactive checks Active", async ({
    page,
  }) => {
    const { dialog } = await openDialog(
      page,
      "Status",
      undefined,
      selected("inactive"),
    );
    const active = dialog.getByRole("checkbox", {
      name: "Active",
      exact: true,
    });
    await expect(
      active,
      "could not check: Active is not there or is checked",
    ).not.toBeChecked();
    await setFilters(page, selected("active", "inactive"));
    await expect(active).toBeChecked();
  });
});

// Opens Status's dialog with `before` applied
const openStatus = (
  page: Page,
  address: string | undefined,
  before: string[],
) =>
  openDialog(page, "Status", address, {
    status: { kind: "categorical", selected: before },
  });

// Presses the checkbox `name` once, reads the calls at once, then lets a second of page time pass: no call may follow
// the press, so a delayed second emit is a finding. Returns the calls
async function pressed(
  opened: Awaited<ReturnType<typeof openStatus>>,
  name: string,
) {
  await opened.dialog.getByRole("checkbox", { name, exact: true }).click();
  const first = await opened.calls();
  await opened.at(1000);
  expect(await opened.calls(), "a call followed the press").toEqual(first);
  return first;
}

// The `onfilter` argument of Status's selection
const statusCall = (selected: string[]) => ({
  id: "status",
  state: { kind: "categorical", selected },
});

// @spec("FILT-04", "fe910161")
test.describe("FILT-04, each toggle of a categorical option emits the next selection at once", () => {
  const rows = [
    { before: [], press: "Inactive", after: ["inactive"] },
    { before: ["inactive"], press: "Active", after: ["active", "inactive"] },
    { before: ["active", "inactive"], press: "Active", after: ["inactive"] },
  ];
  for (const row of rows)
    test(`selected ${JSON.stringify(row.before)}, press ${row.press}`, async ({
      page,
    }) => {
      const opened = await openStatus(page, undefined, row.before);
      for (const [name, value] of [
        ["Active", "active"],
        ["Inactive", "inactive"],
      ] as const)
        await expect(
          opened.dialog.getByRole("checkbox", { name, exact: true }),
          `could not check: ${name} is not in the expected state`,
        ).toBeChecked({ checked: row.before.includes(value) });
      expect(await pressed(opened, row.press)).toEqual([statusCall(row.after)]);
    });
});

// @spec("FILT-53", "ebf9eefe")
test.describe("FILT-53, a categorical filter with emptyOption offers one more option last, whose value is empty", () => {
  const names = ["Active", "Inactive", "(empty)"];
  const rows = [
    { before: [], checked: [], press: "(empty)", after: [""] },
    {
      before: [""],
      checked: ["(empty)"],
      press: "Active",
      after: ["active", ""],
    },
    {
      before: ["active", ""],
      checked: ["Active", "(empty)"],
      press: "(empty)",
      after: ["active"],
    },
  ];
  for (const row of rows)
    test(`selected ${JSON.stringify(row.before)}, press ${row.press}`, async ({
      page,
    }) => {
      const opened = await openStatus(
        page,
        "/filter-dialog.html?empty",
        row.before,
      );
      const boxes = opened.dialog.getByRole("checkbox");
      await expect(boxes).toHaveCount(names.length);
      for (const [index, name] of names.entries()) {
        await expect(boxes.nth(index)).toHaveAccessibleName(name);
        if (row.checked.includes(name))
          await expect(boxes.nth(index)).toBeChecked();
        else await expect(boxes.nth(index)).not.toBeChecked();
      }
      expect(await pressed(opened, row.press)).toEqual([statusCall(row.after)]);
    });
});

// Presses "Filter Status" twice: the dialog closes, then opens again
async function reopenStatus(page: Page, dialog: Locator) {
  const button = page.getByRole("button", {
    name: "Filter Status",
    exact: true,
  });
  await button.click();
  await expect(
    dialog.getByRole("checkbox"),
    "could not check: the dialog did not close",
  ).toHaveCount(0);
  await button.click();
  await expect(
    dialog.getByRole("checkbox"),
    "could not check: the dialog did not open",
  ).toHaveCount(2);
}

// Waits until the table shows Status's selection `selected` as a badge, or no Status badge for none: the answer has
// arrived. The badge names the labels in the options' order
async function statusShown(page: Page, selected: string[]) {
  const labels = [
    ["active", "Active"],
    ["inactive", "Inactive"],
  ]
    .filter(([value]) => selected.includes(value ?? ""))
    .map(([, label]) => label)
    .join(", ");
  await expect(
    page.getByRole("button", {
      name: labels ? `Clear filter Status: ${labels}` : "Clear filter Status",
      exact: labels !== "",
    }),
    "could not check: the answer did not arrive",
  ).toHaveCount(labels ? 1 : 0);
}

// A step is a checkbox to press, "reopen", or the selection `filters` becomes
type Step = string | string[];
const a = "active";
const i = "inactive";

// A row's title from its steps
const titled = (steps: Step[]) =>
  steps
    .map((step) =>
      typeof step === "string"
        ? step === "reopen"
          ? step
          : `press ${step}`
        : `filters ${JSON.stringify(step)}`,
    )
    .join("; ");

// Opens Status's dialog with "inactive" applied and plays the steps in it; returns what `openStatus` does
async function play(page: Page, steps: Step[]) {
  const opened = await openStatus(page, undefined, [i]);
  await expect(
    opened.dialog.getByRole("checkbox"),
    "could not check: the dialog does not hold two boxes",
  ).toHaveCount(2);
  let applied = [i];
  for (const step of steps)
    if (step === "reopen") await reopenStatus(page, opened.dialog);
    else if (typeof step === "string")
      await opened.dialog
        .getByRole("checkbox", { name: step, exact: true })
        .click();
    else {
      await setFilters(page, {
        status: { kind: "categorical", selected: step },
      });
      // An equal selection given again changes no badge: H-61e is the proof that it arrived
      if (
        JSON.stringify([...step].sort()) !== JSON.stringify([...applied].sort())
      )
        await statusShown(page, step);
      applied = step;
    }
  return opened;
}

// One test for each row: plays its steps, then lets `check` read the result
function eachRow<Row extends { steps: Step[] }>(
  rows: Row[],
  check: (opened: Awaited<ReturnType<typeof play>>, row: Row) => Promise<void>,
) {
  for (const [n, row] of rows.entries())
    test(`row ${n + 1}: ${titled(row.steps)}`, async ({ page }) =>
      check(await play(page, row.steps), row));
}

// @spec("FILT-61", "a95a98bf")
test.describe("FILT-61, a press toggles within the selection the last waiting press emitted", () => {
  const rows: { steps: Step[]; calls: string[][] }[] = [
    { steps: ["Active", "Inactive"], calls: [[a, i], [a]] },
    { steps: ["Active", "Active"], calls: [[a, i], [i]] },
    {
      steps: ["Active", "Inactive", [i, a], "Active"],
      calls: [[a, i], [a], []],
    },
    {
      steps: ["Active", "Inactive", [a], "Active"],
      calls: [[a, i], [a], []],
    },
    {
      steps: ["Active", "Inactive", [], "Inactive"],
      calls: [[a, i], [a], [i]],
    },
    { steps: ["Active", [i], "Inactive"], calls: [[a, i], [a]] },
    {
      steps: ["Active", "Inactive", [i, a], "reopen", "Inactive"],
      calls: [[a, i], [a], [a]],
    },
    {
      steps: ["Active", "Inactive", "Active", [a], "Inactive"],
      calls: [[a, i], [a], [], [i]],
    },
  ];
  eachRow(rows, async (opened, row) => {
    const first = await opened.calls();
    expect(first).toEqual(row.calls.map(statusCall));
    await opened.at(1000);
    expect(await opened.calls(), "a call followed the press").toEqual(first);
  });
});

// @spec("FILT-62", "d37be37d")
test.describe("FILT-62, the boxes show the selection the last waiting press emitted", () => {
  const rows: { steps: Step[]; checked: string[] }[] = [
    { steps: ["Active"], checked: ["Active", "Inactive"] },
    { steps: ["Active", "Inactive", [a, i]], checked: ["Active"] },
    { steps: ["Active", "Inactive", [a]], checked: ["Active"] },
    { steps: ["Active", []], checked: [] },
    {
      steps: ["Active", "Inactive", [i, a], "reopen"],
      checked: ["Active", "Inactive"],
    },
    { steps: ["Active", [i]], checked: ["Active", "Inactive"] },
  ];
  eachRow(rows, async (opened, row) => {
    const shown = async () => {
      for (const name of ["Active", "Inactive"])
        await expect(
          opened.dialog.getByRole("checkbox", { name, exact: true }),
        ).toBeChecked({ checked: row.checked.includes(name) });
    };
    await shown();
    await opened.at(1000);
    await shown();
  });
});
