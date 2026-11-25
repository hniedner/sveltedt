// What the real-browser specs of the keyboard share (spec conventions): the key that moves focus on, and A11Y-16's read.
import type { Page } from "@playwright/test";

// The key that moves focus to the next stop. WebKit on macOS skips buttons on Tab under the system's default keyboard
// setting, and its keyboard users press Option+Tab (microsoft/playwright issue 41808); every other engine and platform
// tabs to buttons, and Alt+Tab would not move focus in Firefox.
export const tabKey = (browserName: string): string =>
  browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";

// A11Y-16's visible: rendered and not hidden by display, visibility, opacity or hidden, at any scroll position. The
// text is what a reader gets; the elements are named by their place in the tree.
export const visibleNow = (page: Page) =>
  page.evaluate(() => {
    const place = (el: Element): string => {
      const parent = el.parentElement;
      return parent === null
        ? el.tagName
        : `${place(parent)}>${el.tagName}${[...parent.children].indexOf(el)}`;
    };
    const shown = [...document.body.querySelectorAll("*")].filter((el) =>
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    );
    return { text: document.body.innerText, elements: shown.map(place) };
  });
