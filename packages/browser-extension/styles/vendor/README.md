# Vendored design sources

These files are copied unchanged from their upstream repositories. Don't edit them; update them by
re-downloading. How they are used is described in [`../../DESIGN.md`](../../DESIGN.md).

| File | Source | Upstream commit | License |
| --- | --- | --- | --- |
| `open-design-claude.tokens.css` | [nexu-io/open-design](https://github.com/nexu-io/open-design) `design-systems/claude/tokens.css` | `9724c44` | Apache-2.0 ([`LICENSE-open-design.txt`](LICENSE-open-design.txt)) |
| `awesome-design-md-claude.DESIGN.md` | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) `design-md/claude/DESIGN.md` | `3b60532` | MIT ([`LICENSE-awesome-design-md.txt`](LICENSE-awesome-design-md.txt)) |

Both are independent analyses of Anthropic's public Claude website and are not affiliated with or
endorsed by Anthropic. Socratica uses them as a reference for structure, spacing, type and depth
(warm parchment surfaces, serif headings, ring-style hairlines); it keeps its own name, laurel mark,
gold accent and verdict colours.

`scripts/build-css.mjs` turns the open-design token file into `../generated/od-tokens.css` (every
variable prefixed `--od-` and also declared on `:host` for the Shadow DOM overlay). That generated
file is not committed.
