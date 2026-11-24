// What the browser specs share to read the policy's listener (spec conventions): the strict policy as the server
// sends it, the listener's list and the opening of a page that checks both.
import { expect, type Page } from "@playwright/test";

export const POLICY = "default-src 'self'; script-src 'self'; style-src 'self'";

// The listener's list (spec conventions), or undefined when the page has none
export const listOf = (page: Page) =>
  page.evaluate(() => (window as Window & { __csp?: unknown[] }).__csp);

// Opens a page and checks, in order, that its answer carries the strict policy and that the listener's list exists
export async function open(page: Page, path: string): Promise<void> {
  const answer = await page.goto(path);
  expect(answer?.headers()["content-security-policy"]).toBe(POLICY);
  expect(await listOf(page)).toEqual(expect.any(Array));
}
