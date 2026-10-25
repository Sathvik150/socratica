# Socratica design system

Socratica looks like a well-made book: a subtle off-white page, a classical serif for headings and the
wordmark, a calm humanist sans for reading, one antique-gold accent, and a laurel mark. The structure
(parchment surfaces, ring hairlines instead of heavy shadows, generous line height, soft corners) follows
the Claude design analyses in [`styles/vendor/`](styles/vendor/README.md); the name, laurel, gold and
verdict colours are Socratica's own. Light and dark themes are both complete: extension pages follow the
OS setting, and the in-page overlay follows ChatGPT's own theme.

Before 0.2.0 the project was called Hallucination Firewall and used an indigo-violet look.

## Where the styles live

`pnpm build` (or `pnpm build:css`) runs `scripts/build-css.mjs`, which compiles the stylesheets with the
[Tailwind CSS v4](https://github.com/tailwindlabs/tailwindcss) CLI:

| Source | Output | Used by |
| --- | --- | --- |
| `styles/tokens.css` | imported by both files below | colours, type, radii, motion |
| `styles/pages.css` | `static/theme.css` (copied into `dist/`) | popup, settings page, demo page |
| `styles/overlay.css` | `src/ui/overlay.generated.ts` (CSS as a string) | in-page summary bar and evidence panel (Shadow DOM) |

There is no Tailwind preflight. Tailwind provides the `@theme` tokens, `@utility` blocks for the light and
dark palettes and the skeleton shimmer, a few sizing utilities used by skeletons in the HTML, and
minification. Utilities live in a cascade layer, so the plain design rules always win.

Three outside design sources are used, all vendored or pinned:

- **open-design** (`styles/vendor/open-design-claude.tokens.css`, Apache-2.0): the build copies it to
  `styles/generated/od-tokens.css` with every variable prefixed `--od-` and declared on `:root, :host`, so
  the Shadow DOM sees it too. Surfaces, body text, muted text, radii, easing and the focus ring come from it.
- **awesome-design-md** (`styles/vendor/awesome-design-md-claude.DESIGN.md`, MIT): the rules followed for
  type, spacing and depth (serif display over a sans body, one accent used sparingly, ring-style borders).
- **Tailwind CSS** compiles everything.

## Type

| Role | Face | Notes |
| --- | --- | --- |
| Display: wordmark, headings, the claim in the evidence panel, quotes | Garogier (`static/fonts/Garogier.ttf`, GPL-2.0-or-later, bundled unmodified) | Falls back to Cormorant Garamond, EB Garamond, Garamond, Palatino, Georgia |
| Body and controls | Inter, then the system UI font | 15px / 1.6 on pages, 13–13.5px in the popup and overlay |
| Eyebrows and labels | the sans, 600, uppercase, letter-spacing .16–.32em | "AI YOU CAN TRUST", "REASON", "EVIDENCE" |

The wordmark is "SOCRATICA" in the display face with wide letter-spacing (.26–.34em). Extension pages load
Garogier with `@font-face` in `pages.css`. The overlay can't: a relative URL inside chatgpt.com would point at
chatgpt.com, and the page's CSP may block it. So `loadSerifFont()` (in `src/ui/theme.ts`) fetches the font
from the extension (`web_accessible_resources`, matched to chatgpt.com only) and registers it with the
`FontFace` API. Until it loads, the fallback serif stack is used.

## Colour

`--sc-*` variables switch between light and dark (`sc-light` / `sc-dark` utilities in `tokens.css`):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--sc-canvas` | `#f6f2ea` | `#181613` | the off-white page |
| `--sc-surface`, `--sc-surface-2` | ivory (open-design), `#efe9de` | `#211f1b`, `#2a2723` | cards, insets |
| `--sc-line`, `--sc-line-strong` | `#e6dfd1`, `#d6ccb9` | `#36312a`, `#4a4339` | hairlines, control borders |
| `--sc-ink`, `--sc-body`, `--sc-muted` | `#23211e`, open-design body, open-design muted | `#f4efe5`, `#ddd5c6`, `#b2a996` | headings, text, secondary text |
| `--sc-gold`, `--sc-gold-strong` | `#a9884f`, `#8f6e36` | `#d2b07a` | laurel, primary buttons, active tab, switch on |
| `--sc-gold-text` | `#7a5d2b` | `#dcbc88` | gold text (5.4:1 on the canvas, so it passes WCAG AA) |
| `--sc-ok*`, `--sc-bad*`, `--sc-unk*` | sage, brick, ochre (text on their tints passes AA) | lighter tints | supported, contradicted, unverifiable |

Gold is the only accent. Verdict colours appear only on verdicts: chips, seals, the meter and highlights.

## Shape, depth and motion

- Radii: 8px small controls, 12px inputs, 16px cards, 20px floating panels, pills for buttons and chips.
- Depth: a 1px ring plus a soft, warm shadow (`--sc-shadow`). The evidence panel is the one floating element,
  so it is the only one with a deeper shadow.
- Motion: short rise and pop animations with open-design's standard easing, a meter that grows into place, and
  skeleton shimmer. All of it is turned off under `prefers-reduced-motion`.

## The laurel

The laurel wreath (`LAUREL_PATH` in `src/ui/icons.ts`, inlined in the HTML pages) is two arcs of leaves on a
64-unit grid, generated so every leaf has the same winding (overlapping subpaths with opposite winding showed
seams). The toolbar icons put a Garogier "S" inside the laurel on an off-white tile. Other icons are 24-unit
stroke icons at 1.6px.

## Surfaces

- **Popup** (`static/popup.html`, `src/popupView.ts`): a rounded card with the laurel and wordmark, a small
  on/off switch with slightly rounded corners, and a settings button. Three tabs: **Verify** (this page, check
  selected text), **Sources** (the required web search engine, the other sources, the judge) and **Insights**
  (the last check's meter and legend, how to read a verdict, and the Socrates line).
- **Settings** (`src/optionsView.ts`): a centred column of cards: privacy notice, **Web search** (marked
  Required, one engine chosen from cards, one key field), Judge, More evidence sources, Platforms. Save sits in
  an opaque floating bar at the bottom of the window.
- **Overlay** (`styles/overlay.css`, `src/overlay.ts`): the summary bar under each answer (laurel, wordmark,
  meter, verdict chips, "Show details"), dashed or wavy underlines on claims, and the evidence panel: a verdict
  seal and meaning, the claim in the display face, confidence, reason, suggested correction, and each source as
  a card with its verbatim quote below it.
- **Demo** (`static/demo.html`): a landing page in the style of the brand mock-up, with a working, offline
  ChatGPT-like answer in the hero.

Chrome ignores `@property` inside shadow roots, so the build declares Tailwind's `--tw-*` defaults directly for
the overlay.
