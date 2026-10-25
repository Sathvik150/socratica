# Hallucination Firewall design system

The UI is built from three sources:

- **[Tailwind CSS v4](https://github.com/tailwindlabs/tailwindcss)** for all styles (`styles/*.css`, `@apply` and
  `@theme`), compiled at build time. No Tailwind runtime ships.
- **[open-design](https://github.com/nexu-io/open-design)** (Apache-2.0) for token *values*: its
  `design-systems/linear-app/tokens.css` package is vendored in `styles/vendor/` and exposed as `--od-*` variables.
- **[awesome-design-md](https://github.com/VoltAgent/awesome-design-md)** (MIT) for the design *rules*: its Linear
  `DESIGN.md` is vendored next to it and summarised below.

Both Linear files are independent analyses of Linear's public website, not affiliated with Linear. This document
records what we took, what we changed for a browser extension, and where the tokens live in code.

`pnpm build` (or `pnpm build:css`) compiles the styles with the Tailwind CLI:

| Source | Output | Used by |
| --- | --- | --- |
| `styles/pages.css` | `static/theme.css` (copied into `dist/`) | popup, settings page, demo page |
| `styles/overlay.css` | `src/ui/overlay.generated.ts` (CSS as a string) | in-page summary bar and evidence panel (Shadow DOM) |
| `styles/tokens.css` | imported by both | maps `--od-*` tokens onto Tailwind's theme (`bg-surface`, `text-muted`, `rounded-card`, ...) plus our light set and verdict colours |
| `styles/vendor/` | read by the build | the two upstream files, unchanged, with their licenses |

## Taken from the sources

- **One accent, used sparingly.** Lavender-blue `#5e6ad2` (hover `#828fff`) for the brand mark, the primary action,
  focus rings and links. No second accent colour and no accent-filled surfaces.
- **Hierarchy from stepped surfaces and hairline borders, not shadows or gradients.** Dark canvas `--od-bg`
  (`#08090a`), surfaces stepping up to `--od-surface` (`#191a1b`), translucent white borders (`--od-border`, 8%).
  Only the floating evidence panel has a shadow (`--od-elev-raised` plus a soft drop), because it floats over
  someone else's page.
- **Text tiers.** Primary `#f7f8f8`, secondary `#d0d6e0`, tertiary `#8a8f98`, quaternary `#62666d` (dark).
- **Type.** Inter-style system sans: 600 for headings with slight negative tracking, 400 for body, 510 to 550 for
  labels. Small uppercase eyebrows have positive tracking. Mono is used only for code.
- **Shape.** 4px spacing base. open-design's radius scale: 6px (`--od-radius-sm`) for buttons and inputs, 12px
  (`--od-radius-lg`) for cards and the summary bar; one step more (16px) for the floating panel and the popup card.
  Pills are reserved for status badges (verdict chips) and the on/off switch.
- **Focus and motion.** A lavender outline on controls and `--od-focus-ring` on inputs; open-design's
  `--od-ease-standard` easing for every transition.

## Changed for the extension

- **Light mode.** The Linear file is dark-only. The overlay has to sit inside ChatGPT's light theme too, so there is a
  light set built on the same rules: surfaces `#ffffff / #f7f8f8 / #f1f2f4`, borders `#e6e7ea / #d7d9de`, text
  `#1b1c1f / #3c3f45 / #6b6f76`. The accent is the same.
- **Verdict colours.** Linear has a single semantic green. A fact checker needs three states, so we add red and amber
  in the same muted register: supported `#27a644`, contradicted `#eb5757`, unverifiable `#f2994a`. On light
  backgrounds the text versions are darkened (`#1f7a35`, `#c42b2b`, `#9a4d0f`) to meet WCAG AA at 12px.
- **No web fonts.** Extension pages and the overlay load instantly, so we don't bundle Inter: the stack uses Inter
  when it's installed, then the system UI font.
- **Shadow DOM.** open-design declares tokens on `:root`, which doesn't reach into the overlay's shadow root, and
  shares names with Tailwind's theme (`--radius-sm`). The build copies them as `--od-*` on `:root, :host`. Chrome also
  ignores `@property` inside shadow roots, so the build declares Tailwind's `--tw-*` defaults directly.
- **Skeleton loaders.** Anything that waits on the network shows a skeleton with the same size as the finished
  content (the summary bar while checking, the popup while loading, a selection check in progress, the settings
  page while it loads). Skeletons shimmer, and stay still when the user prefers reduced motion.
