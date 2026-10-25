# Hallucination Firewall design system

The extension uses the original Hallucination Firewall look from v0.1.4: an indigo-to-violet brand gradient
(`#6366f1 → #a855f7`), soft white or dark cards with gentle shadows, pill-shaped verdict chips, and light and dark
themes. The in-page overlay follows ChatGPT's own theme, and the extension pages follow the OS setting.

Version 0.1.5 briefly used a different look based on Linear's design. 0.1.6 went back to this one and kept every
feature added in 0.1.5, restyled to match.

## Where the styles live

`pnpm build` (or `pnpm build:css`) compiles the stylesheets with the [Tailwind CSS v4](https://github.com/tailwindlabs/tailwindcss) CLI:

| Source | Output | Used by |
| --- | --- | --- |
| `styles/pages.css` | `static/theme.css` (copied into `dist/`) | popup, settings page, demo page |
| `styles/overlay.css` | `src/ui/overlay.generated.ts` (CSS as a string) | in-page summary bar and evidence panel (Shadow DOM) |

Both files are mostly plain CSS: the original rules, unchanged. Tailwind provides:

- `@apply` for the newer pieces (skeleton loaders, the "Offline judge" label, the "Show details" toggle);
- the small utility classes the skeleton placeholders use in the HTML (`w-4/5`, `h-7`, `mt-1`);
- minification.

There is no Tailwind preflight, so the original rules render exactly as written. Utilities live in a cascade layer,
so the unlayered design rules always win.

The popup's layout rules sit in a `<style>` block in `static/popup.html`, and the demo page's in
`static/demo.html`, as they did originally.

## Tokens

All colours are CSS variables, defined once for light and once for dark:

- **Pages:** `:root` in `styles/pages.css`, switching with `prefers-color-scheme`.
- **Overlay:** `:host` and `:host([data-theme="dark"])` in `styles/overlay.css`.

| Token | Light | Use |
| --- | --- | --- |
| `--hf-brand-1`, `--hf-brand-2`, `--hf-brand` | `#6366f1`, `#a855f7`, gradient | logo, primary buttons, switch "on", links, focus |
| `--hf-bg`, `--hf-surface`, `--hf-surface-2` | `#f7f7fb`, `#fff`, `#f3f4f8` | page, cards, insets |
| `--hf-fg`, `--hf-muted`, `--hf-border` | `#0f172a`, `#5b6475`, `#e4e6ef` | text, secondary text, hairlines |
| `--hf-ok*`, `--hf-bad*`, `--hf-unk*` | green, rose, amber | supported, contradicted, unverifiable |

## Details added in 0.1.5, kept in this style

- **On/off switch** in the popup header: a small 28×16 track with slightly rounded corners and a rounded knob. It is
  grey when off, uses the brand gradient when on, and has a muted label. It is deliberately quieter than a pill.
- **Rounded popup:** the popup content sits in a card with 12px corners and a hairline border. Chrome draws the popup
  window itself, so the window's own corners can't be changed by the extension.
- **Skeleton loaders** in the popup, the settings page, the selected-text check and the in-page bar, using the
  original shimmer. Each is the same size as what replaces it.
- **"Show details"** at the bottom of the summary bar, the dashed "Offline judge" label, and grey info notes.
- Chrome ignores `@property` inside shadow roots, so the build declares Tailwind's `--tw-*` defaults directly.
