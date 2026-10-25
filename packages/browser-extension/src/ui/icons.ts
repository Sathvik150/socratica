/**
 * Socratica icon set. Line icons are drawn on one 24px grid with a 1.6px stroke (the
 * mockup's fine-line style); the laurel wreath is a filled 64px mark. All are original
 * drawings, built with DOM APIs so no markup string is ever parsed.
 */

interface IconDef { d: string; viewBox?: string; fill?: boolean }

const ICONS = {
  laurel: { viewBox: '0 0 64 64', fill: true, d: 'M22.6 52.4 L20.8 51.4 L19.1 50.2 L17.5 49 L16.1 47.5 L14.8 45.9 L13.6 44.3 L12.6 42.5 L11.8 40.6 L11.2 38.7 L10.8 36.7 L10.5 34.7 L10.5 32.6 L10.6 30.6 L10.9 28.6 L11.4 26.6 L12.1 24.7 L13 22.9 L14 21.1 L15.2 19.5 L16.6 17.9 L18.1 16.6 L19.7 15.3 L21.4 14.2 L23.2 13.3 L23.7 14.3 L22 15.2 L20.3 16.2 L18.8 17.4 L17.4 18.7 L16.1 20.2 L14.9 21.7 L14 23.4 L13.1 25.1 L12.5 26.9 L12 28.8 L11.7 30.7 L11.6 32.6 L11.6 34.6 L11.9 36.5 L12.3 38.4 L12.9 40.2 L13.6 42 L14.6 43.7 L15.7 45.3 L16.9 46.8 L18.3 48.1 L19.7 49.4 L21.3 50.5 L23 51.4ZM18.8 49.3Q13.9 52.4 9.2 49.2Q14 46.1 18.8 49.3ZM18.8 49.3Q14.6 45.4 16.6 40Q20.8 43.9 18.8 49.3ZM14.4 44.5Q9.2 45.9 5.8 41.6Q11.1 40.2 14.4 44.5ZM14.4 44.5Q11.8 39.7 15.2 35.5Q17.8 40.2 14.4 44.5ZM11.8 38.6Q6.7 38.3 4.9 33.5Q10 33.8 11.8 38.6ZM11.8 38.6Q10.8 33.6 15 30.7Q16 35.7 11.8 38.6ZM11 32.2Q6.5 30.4 6.3 25.7Q10.8 27.4 11 32.2ZM11 32.2Q11.6 27.4 16.2 26.1Q15.6 30.8 11 32.2ZM12.3 25.8Q8.8 23 10 18.7Q13.5 21.5 12.3 25.8ZM12.3 25.8Q14.1 21.7 18.6 21.8Q16.7 25.9 12.3 25.8ZM15.4 20.1Q13.1 16.7 15.4 13.2Q17.7 16.6 15.4 20.1ZM15.4 20.1Q18.2 17.1 22.1 18.4Q19.3 21.5 15.4 20.1ZM20.1 15.7Q19.1 12 22.1 9.6Q23.1 13.3 20.1 15.7ZM20.1 15.7Q23.5 13.8 26.5 16.1Q23.2 18 20.1 15.7ZM23.5 13.8Q25.6 10.3 29.6 11.1Q27.5 14.6 23.5 13.8ZM41 51.4 L42.7 50.5 L44.3 49.4 L45.7 48.1 L47.1 46.8 L48.3 45.3 L49.4 43.7 L50.4 42 L51.1 40.2 L51.7 38.4 L52.1 36.5 L52.4 34.6 L52.4 32.6 L52.3 30.7 L52 28.8 L51.5 26.9 L50.9 25.1 L50 23.4 L49.1 21.7 L47.9 20.2 L46.6 18.7 L45.2 17.4 L43.7 16.2 L42 15.2 L40.3 14.3 L40.8 13.3 L42.6 14.2 L44.3 15.3 L45.9 16.6 L47.4 17.9 L48.8 19.5 L50 21.1 L51 22.9 L51.9 24.7 L52.6 26.6 L53.1 28.6 L53.4 30.6 L53.5 32.6 L53.5 34.7 L53.2 36.7 L52.8 38.7 L52.2 40.6 L51.4 42.5 L50.4 44.3 L49.2 45.9 L47.9 47.5 L46.5 49 L44.9 50.2 L43.2 51.4 L41.4 52.4ZM45.2 49.3Q50 46.1 54.8 49.2Q50.1 52.4 45.2 49.3ZM45.2 49.3Q43.2 43.9 47.4 40Q49.4 45.4 45.2 49.3ZM49.6 44.5Q52.9 40.2 58.2 41.6Q54.8 45.9 49.6 44.5ZM49.6 44.5Q46.2 40.2 48.8 35.5Q52.2 39.7 49.6 44.5ZM52.2 38.6Q54 33.8 59.1 33.5Q57.3 38.3 52.2 38.6ZM52.2 38.6Q48 35.7 49 30.7Q53.2 33.6 52.2 38.6ZM53 32.2Q53.2 27.4 57.7 25.7Q57.5 30.4 53 32.2ZM53 32.2Q48.4 30.8 47.8 26.1Q52.4 27.4 53 32.2ZM51.7 25.8Q50.5 21.5 54 18.7Q55.2 23 51.7 25.8ZM51.7 25.8Q47.3 25.9 45.4 21.8Q49.9 21.7 51.7 25.8ZM48.6 20.1Q46.3 16.6 48.6 13.2Q50.9 16.7 48.6 20.1ZM48.6 20.1Q44.7 21.5 41.9 18.4Q45.8 17.1 48.6 20.1ZM43.9 15.7Q40.9 13.3 41.9 9.6Q44.9 12 43.9 15.7ZM43.9 15.7Q40.8 18 37.5 16.1Q40.5 13.8 43.9 15.7ZM40.5 13.8Q36.5 14.6 34.4 11.1Q38.4 10.3 40.5 13.8Z' },
  check: { d: 'M5 12.5l4.5 4.5L19 7.5' },
  cross: { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' },
  question: { d: 'M9.4 9.2a2.7 2.7 0 1 1 3.7 2.5c-.7.3-1.1.9-1.1 1.6v.7M12 17v.01' },
  refresh: { d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V9H15' },
  chevron: { d: 'M6 9.5l6 6 6-6' },
  external: { d: 'M14 4.5h5.5V10M19.5 4.5L11 13M18 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h5' },
  alert: { d: 'M12 4.5L3.5 19.5h17zM12 10v4M12 17v.01' },
  info: { d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 11v5M12 8v.01' },
  gear: { d: 'M10.34 5.82 L10.59 3.11 L13.41 3.11 L13.66 5.82 L15.2 6.46 L17.29 4.72 L19.28 6.71 L17.54 8.8 L18.18 10.34 L20.89 10.59 L20.89 13.41 L18.18 13.66 L17.54 15.2 L19.28 17.29 L17.29 19.28 L15.2 17.54 L13.66 18.18 L13.41 20.89 L10.59 20.89 L10.34 18.18 L8.8 17.54 L6.71 19.28 L4.72 17.29 L6.46 15.2 L5.82 13.66 L3.11 13.41 L3.11 10.59 L5.82 10.34 L6.46 8.8 L4.72 6.71 L6.71 4.72 L8.8 6.46Z M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z' },
  columns: { d: 'M3.5 9L12 4l8.5 5zM5 9.5v8M9.3 9.5v8M14.7 9.5v8M19 9.5v8M3.5 18h17M2.5 20.5h19' },
  document: { d: 'M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8zM14 3.5V8h4.5M8.5 12.5h7M8.5 15.5h7M8.5 9.5h3' },
  docSearch: { d: 'M13.5 20.5h-7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1H14L18.5 8v3M14 3.5V8h4.5M8.5 9.5h3M8.5 12.5h4M16.8 19.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM18.7 19.4l2 2' },
  shield: { d: 'M12 3.5L5 6.2v5.3c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6.2zM9 12l2.2 2.2L15.3 10' },
  book: { d: 'M12 6.8C10.2 5.5 7.6 4.8 4.5 4.8v13c3.1 0 5.7.7 7.5 2 1.8-1.3 4.4-2 7.5-2v-13c-3.1 0-5.7.7-7.5 2zM12 6.8v13' },
  dialogue: { d: 'M4.5 5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.2 3.5V16H4.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM10.2 9a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M12 13.9v.01' },
  user: { d: 'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 19.5c.9-3.2 3.7-5.3 7-5.3s6.1 2.1 7 5.3' },
  bot: { d: 'M6.5 9.5h11a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-5.5a2 2 0 0 1 2-2zM12 6v3.5M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2M9.5 14v.01M14.5 14v.01' },
  arrowRight: { d: 'M5 12h14M13 6l6 6-6 6' },
  play: { d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM10.3 8.9l4.6 3.1-4.6 3.1z' },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

/** Inline SVG icon built with DOM APIs (no innerHTML). Line icons take `currentColor` as their stroke. */
export function icon(doc: Document, name: IconName, size = 14): SVGSVGElement {
  const def: IconDef = ICONS[name];
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', def.viewBox ?? '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  if (def.fill) {
    svg.setAttribute('fill', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', def.d);
  svg.append(path);
  return svg;
}

/** The laurel path, for building the toolbar icons and static SVG files. */
export const LAUREL_PATH = ICONS.laurel.d;
