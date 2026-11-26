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

// Opens the dialog of "Filter Name" on the page, `address` setting `searchDelay` and the like, with the clock paused at
// the start: page time moves only by `at`, so "400 ms" is exact. `filters` is what the application has applied. Returns
// the field "Filter Name text", `at(ms)` that moves the clock to `ms` after the first key (keys take no time), and
// `calls()` that reads every `onfilter` argument so far
async function openName(
  page: Page,
  address = "/filter-dialog.html",
  filters = {},
) {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(new Date(START.getTime() + 1000));
  await page.goto(address);
  await setFilters(page, filters);
  await page.getByRole("button", { name: "Filter Name", exact: true }).click();
  const field = page
    .getByRole("dialog", { name: "Name filter", exact: true })
    .getByLabel("Filter Name text");
  await expect(
    field,
    "could not check: Name's dialog holds no field",
  ).toHaveCount(1);
  let elapsed = 0;
  const at = async (ms: number) => {
    await page.clock.runFor(ms - elapsed);
    elapsed = ms;
  };
  const calls = () =>
    page.evaluate(() => (window as unknown as DialogWindow).__calls.onfilter);
  expect(await calls(), "could not check: a call before the first key").toEqual(
    [],
  );
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
// clipboard in a headless run (MEASURED on macOS), but a headed run may overwrite the developer's
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

// Opens with "beta" applied, clicks into the field (typing into a field that holds text puts the key at the start unless
// the caret is placed), types "x" and lets the pause pass: FILT-37's rows 4 to 6 start with the one call "betax"
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

// How a FILT-03 row puts its text into the field, and the address of the page it runs on
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
