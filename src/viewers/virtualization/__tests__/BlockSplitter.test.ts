import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlockSplitter } from '../BlockSplitter';

describe('BlockSplitter', () => {
  let splitter: BlockSplitter;
  let mockDoc: Document;

  beforeEach(() => {
    splitter = new BlockSplitter({ blockSize: 1000 });
    mockDoc = document.implementation.createHTMLDocument();

    // jsdom 不支持布局计算，需要 mock getBoundingClientRect
    // 根据 style.height 返回对应的高度值
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const styleHeight = this.style.height;
      const height = styleHeight ? parseFloat(styleHeight) : 0;
      return {
        top: 0,
        right: 0,
        bottom: height,
        left: 0,
        width: 0,
        height,
        x: 0,
        y: 0,
        toJSON() {},
      };
    });
  });

  it('should split document into blocks based on height', () => {
    const body = mockDoc.body;
    for (let i = 0; i < 10; i++) {
      const p = mockDoc.createElement('p');
      p.textContent = `Paragraph ${i}`;
      p.style.height = '150px';
      body.appendChild(p);
    }

    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0].height).toBeLessThanOrEqual(1000);
  });

  it('should not split individual elements', () => {
    const body = mockDoc.body;
    const largeP = mockDoc.createElement('p');
    largeP.textContent = 'Large paragraph';
    largeP.style.height = '1200px';
    body.appendChild(largeP);

    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBe(1);
    expect(blocks[0].elements).toContain(largeP);
  });

  it('should preserve container boundaries', () => {
    const body = mockDoc.body;
    const table = mockDoc.createElement('table');
    table.style.height = '800px';
    const tr = mockDoc.createElement('tr');
    table.appendChild(tr);
    body.appendChild(table);

    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBe(1);
    expect(blocks[0].elements).toContain(table);
  });

  it('should handle empty document', () => {
    const blocks = splitter.split(mockDoc);
    expect(blocks.length).toBe(0);
  });
});
