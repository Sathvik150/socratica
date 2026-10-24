import { describe, expect, it } from 'vitest';
import { mergeLineRects } from '../overlay.js';

describe('mergeLineRects', () => {
  it('collapses fragment rects into one box per line', () => {
    const line1 = [0, 40, 90, 150].map((left) => ({ left, right: left + 35, top: 10, bottom: 30 }));
    const line2 = [0, 50].map((left) => ({ left, right: left + 45, top: 34, bottom: 54 }));
    const nestedInline = { left: 40, right: 75, top: 11, bottom: 29 }; // <strong> box inside line 1
    expect(mergeLineRects([...line2, nestedInline, ...line1])).toEqual([
      { left: 0, right: 185, top: 10, bottom: 30 },
      { left: 0, right: 95, top: 34, bottom: 54 },
    ]);
  });

  it('drops empty rects', () => {
    expect(mergeLineRects([{ left: 5, right: 5, top: 0, bottom: 10 }])).toEqual([]);
  });
});
