# Styling guide

SvelteDT ships one stylesheet, `@hniedner/sveltedt/styles.css`. It reads the tokens below and works without any of them:
each has a fallback.

## Tokens

Set a token on any ancestor of the table (or on `:root`) to change what it paints.

| Token            | Paints                            | Fallback     |
| ---------------- | --------------------------------- | ------------ |
| `--sdt-border`   | the divider between two data rows | `GrayText`   |
| `--sdt-progress` | the progress indicator's bar      | `CanvasText` |

The progress bar's default is the system text colour (`CanvasText`); a brand colour set on `--sdt-progress` should keep
3:1 against the background (WCAG 1.4.11).
