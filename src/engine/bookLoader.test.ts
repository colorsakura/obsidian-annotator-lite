import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger (depends on env.ts which uses __DEBUG__ global)
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock foliate-js
vi.mock('foliate-js/view.js', () => ({
  default: {},
}));

// Mock Android patches
vi.mock('../viewers/hooks/useAndroidPatches', () => ({
  enableAndroidPatches: vi.fn(),
  disableAndroidPatches: vi.fn(),
  wrapSectionLoadForAndroid: vi.fn().mockResolvedValue(undefined),
}));

// Mock reader settings
vi.mock('../viewers/hooks/useReaderSettings', () => ({
  applyReaderFlowMode: vi.fn(),
  applyColumnMode: vi.fn(),
  applyFontSize: vi.fn(),
}));

// Mock book metadata
vi.mock('../viewers/foliate/foliateBookMetadata', () => ({
  loadBookMetadata: vi.fn().mockResolvedValue({
    info: {
      outline: [],
      metadata: { coverUrl: null, title: null, author: null },
      totalSections: 0,
    },
    coverUrl: null,
  }),
}));

// Mock navigation
vi.mock('../viewers/foliate/foliateNavigation', () => ({
  installRelocateListener: vi.fn().mockReturnValue(vi.fn()),
}));

import { loadBook } from './bookLoader';
import { TFile } from 'obsidian';

// 保存原始 createElement（在任何 spy 之前），避免 spy 嵌套导致递归
const _origCreateElement = document.createElement.bind(document);

/**
 * 创建一个 mock foliate-view 元素（真实 DOM 节点 + mock 方法）。
 * 使用真实 DOM 节点以通过 jsdom 的 appendChild 类型检查。
 */
function createMockView(methods: Record<string, any> = {}): HTMLElement {
  const el = _origCreateElement('div');
  Object.assign(el, {
    open: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    book: {
      sections: [],
      metadata: {},
      toc: [],
      getCover: vi.fn().mockResolvedValue(null),
    },
    renderer: { getContents: vi.fn().mockReturnValue([]) },
    ...methods,
  });
  return el;
}

/** 安装 createElement spy，仅拦截 'foliate-view' 标签名 */
function stubFoliateView(mockView: HTMLElement): vi.SpyInstance {
  return vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'foliate-view') return mockView;
    return _origCreateElement(tag);
  });
}

describe('loadBook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when file is not found in vault', async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
      },
    } as any;

    await expect(
      loadBook(app, document.createElement('div'), '/nonexistent.epub', 'epub', {
        onOutlineLoaded: vi.fn(),
        onMetadataLoaded: vi.fn(),
        onSectionChanged: vi.fn(),
      }),
    ).rejects.toThrow('File not found');
  });

  it('rejects when path resolves to a non-TFile', async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue({ path: '/folder', name: 'folder' }),
      },
    } as any;

    await expect(
      loadBook(app, document.createElement('div'), '/folder', 'epub', {
        onOutlineLoaded: vi.fn(),
        onMetadataLoaded: vi.fn(),
        onSectionChanged: vi.fn(),
      }),
    ).rejects.toThrow('File not found');
  });

  it('reads binary and creates foliate-view element for epub', async () => {
    const mockView = createMockView();
    const spy = stubFoliateView(mockView);

    const tfile = new TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(tfile),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    } as any;

    const container = document.createElement('div');
    const result = await loadBook(app, container, '/test.epub', 'epub', {
      onOutlineLoaded: vi.fn(),
      onMetadataLoaded: vi.fn(),
      onSectionChanged: vi.fn(),
    });

    expect(app.vault.readBinary).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('foliate-view');
    expect(container.contains(mockView)).toBe(true);
    expect(result.fileType).toBe('epub');
    expect(result.view).toBe(mockView);
    spy.mockRestore();
  });

  it('calls onOutlineLoaded and onMetadataLoaded on success', async () => {
    const { loadBookMetadata } = await import('../viewers/foliate/foliateBookMetadata');
    vi.mocked(loadBookMetadata).mockResolvedValueOnce({
      info: {
        outline: [{ title: 'Chapter 1', children: [] }],
        metadata: { coverUrl: null, title: 'Test Book', author: 'Author' },
        totalSections: 1,
      },
      coverUrl: null,
    });

    const mockView = createMockView({
      book: {
        sections: [{ label: 'ch1' }],
        metadata: { title: 'Test Book', author: 'Author' },
        toc: [{ label: 'Chapter 1', href: '#ch1' }],
        getCover: vi.fn().mockResolvedValue(null),
      },
    });
    stubFoliateView(mockView);

    const tfile = new TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(tfile),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    } as any;

    const callbacks = {
      onOutlineLoaded: vi.fn(),
      onMetadataLoaded: vi.fn(),
      onSectionChanged: vi.fn(),
    };

    const result = await loadBook(app, document.createElement('div'), '/test.epub', 'epub', callbacks);

    expect(callbacks.onOutlineLoaded).toHaveBeenCalledWith([
      { title: 'Chapter 1', children: [] },
    ]);
    expect(callbacks.onMetadataLoaded).toHaveBeenCalledWith({
      coverUrl: null,
      title: 'Test Book',
      author: 'Author',
    });
    expect(callbacks.onSectionChanged).toHaveBeenCalledWith(0, 1);
    expect(result.fileType).toBe('epub');
  });

  it('applies reader settings when options provided for epub', async () => {
    const { applyReaderFlowMode, applyColumnMode, applyFontSize } = await import(
      '../viewers/hooks/useReaderSettings'
    );

    const mockView = createMockView();
    stubFoliateView(mockView);

    const tfile = new TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(tfile),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    } as any;

    await loadBook(
      app,
      document.createElement('div'),
      '/test.epub',
      'epub',
      { onOutlineLoaded: vi.fn(), onMetadataLoaded: vi.fn(), onSectionChanged: vi.fn() },
      { flowMode: 'scrolled', columnMode: 'single', fontSize: 120 },
    );

    expect(applyReaderFlowMode).toHaveBeenCalledWith(mockView, 'scrolled');
    expect(applyColumnMode).toHaveBeenCalledWith(mockView, 'single');
    expect(applyFontSize).toHaveBeenCalledWith(mockView, 120);
  });

  it('cleans up view on open failure', async () => {
    const mockView = createMockView({
      open: vi.fn().mockRejectedValue(new Error('open failed')),
    });
    stubFoliateView(mockView);

    const tfile = new TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(tfile),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    } as any;

    await expect(
      loadBook(app, document.createElement('div'), '/test.epub', 'epub', {
        onOutlineLoaded: vi.fn(),
        onMetadataLoaded: vi.fn(),
        onSectionChanged: vi.fn(),
      }),
    ).rejects.toThrow('open failed');

    // close() should have been called during cleanup
    expect(mockView.close).toHaveBeenCalled();
  });

  it('handles PDF file type correctly', async () => {
    const mockBook = {
      rendition: {},
      sections: [],
      metadata: {},
      toc: [],
      getCover: vi.fn().mockResolvedValue(null),
    };

    const mockView = createMockView({ book: mockBook });
    stubFoliateView(mockView);

    // Mock PDF import
    vi.doMock('foliate-js/pdf.js', () => ({
      makePDF: vi.fn().mockResolvedValue(mockBook),
    }));

    const tfile = new TFile();
    tfile.path = '/test.pdf';
    tfile.name = 'test.pdf';

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(tfile),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    } as any;

    const result = await loadBook(
      app,
      document.createElement('div'),
      '/test.pdf',
      'pdf',
      { onOutlineLoaded: vi.fn(), onMetadataLoaded: vi.fn(), onSectionChanged: vi.fn() },
      { columnMode: 'single' },
    );

    expect(result.fileType).toBe('pdf');
    // PDF spread should be set to 'none' for single column
    expect(mockBook.rendition.spread).toBe('none');

    vi.doUnmock('foliate-js/pdf.js');
  });

  it('invokes installRelocateListener with onSectionChanged callback', async () => {
    const { installRelocateListener } = await import('../viewers/foliate/foliateNavigation');

    const mockView = createMockView();
    stubFoliateView(mockView);

    const tfile = new TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(tfile),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    } as any;

    const onSectionChanged = vi.fn();

    await loadBook(app, document.createElement('div'), '/test.epub', 'epub', {
      onOutlineLoaded: vi.fn(),
      onMetadataLoaded: vi.fn(),
      onSectionChanged,
    });

    expect(installRelocateListener).toHaveBeenCalledWith(mockView, onSectionChanged);
  });
});
