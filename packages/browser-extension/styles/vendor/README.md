# Vendored design sources

These files are copied unchanged from their upstream repositories. Don't edit them; update them by re-downloading.
How they are used is described in [`../../DESIGN.md`](../../DESIGN.md).

| File | Source | Upstream commit | License |
| --- | --- | --- | --- |
| `open-design-linear-app.tokens.css` | [nexu-io/open-design](https://github.com/nexu-io/open-design) `design-systems/linear-app/tokens.css` | `9724c44` | Apache-2.0 ([`LICENSE-open-design.txt`](LICENSE-open-design.txt)) |
| `awesome-design-md-linear.DESIGN.md` | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) `design-md/linear.app/DESIGN.md` | `3b60532` | MIT ([`LICENSE-awesome-design-md.txt`](LICENSE-awesome-design-md.txt)) |

Both describe Linear's public website. They are independent analyses and are not affiliated with or endorsed by
Linear. We use them as a design reference and token source, not as Linear branding: the extension keeps its own name,
logo and verdict colours.

`scripts/build-css.mjs` turns the open-design token file into `../generated/od-tokens.css` (variables prefixed
`--od-` and also declared on `:host` for the Shadow DOM overlay). That generated file is not committed.
