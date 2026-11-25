# Styling guide

SvelteDT ships one stylesheet, `@hniedner/sveltedt/styles.css`. It reads the tokens below and works without any of them:
each has a system-colour fallback.

## Tokens

Set a token on any ancestor of the table (or on `:root`) to change what it paints.

| Token            | Paints                            | Fallback    |
| ---------------- | --------------------------------- | ----------- |
| `--sdt-border`   | the divider between two data rows | `GrayText`  |
| `--sdt-progress` | the progress indicator's bar      | `Highlight` |
