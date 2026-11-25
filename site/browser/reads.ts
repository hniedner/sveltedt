// What the real-browser specs of the keyboard share (spec conventions): the key that moves focus on.

// The key that moves focus to the next stop. WebKit on macOS skips buttons on Tab under the system's default keyboard
// setting, and its keyboard users press Option+Tab (microsoft/playwright issue 41808); every other engine and platform
// tabs to buttons, and Alt+Tab would not move focus in Firefox.
export const tabKey = (browserName: string): string =>
  browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
