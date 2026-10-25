/**
 * Extract plain text from rendered HTML while remembering which Text node each
 * character came from, so a claim's character span can be turned back into a
 * DOM Range for highlighting without modifying the page.
 */
export interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

export interface TextMap {
  text: string;
  segments: TextSegment[];
}

const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TR', 'TABLE', 'SECTION', 'ARTICLE', 'BR', 'HR']);
/** Code blocks are never checked; UI injected by this extension is never read back. */
const SKIP = (el: Element) => el.tagName === 'PRE' || el.hasAttribute('data-socratica-ui') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'BUTTON';

export function extractText(root: Node): TextMap {
  let text = '';
  const segments: TextSegment[] = [];
  const newline = () => {
    if (text && !text.endsWith('\n')) text += '\n';
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node as Text).data;
      if (!value) return;
      segments.push({ node: node as Text, start: text.length, end: text.length + value.length });
      text += value;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (SKIP(el)) {
      if (el.tagName === 'PRE') newline();
      return;
    }
    const block = BLOCK.has(el.tagName);
    if (block) newline();
    for (const child of Array.from(el.childNodes)) walk(child);
    if (block) newline();
  };
  walk(root);
  return { text, segments };
}

function locate(map: TextMap, offset: number, preferEnd: boolean): { node: Text; offset: number } | undefined {
  for (const seg of map.segments) {
    const inside = preferEnd ? offset > seg.start && offset <= seg.end : offset >= seg.start && offset < seg.end;
    if (inside) return { node: seg.node, offset: offset - seg.start };
  }
  return undefined;
}

/** DOM Range covering text[start, end), or undefined if the DOM changed since extraction. */
export function rangeForSpan(map: TextMap, start: number, end: number, doc: Document = document): Range | undefined {
  const a = locate(map, start, false);
  const b = locate(map, end, true);
  if (!a || !b || !a.node.isConnected || !b.node.isConnected) return undefined;
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}
