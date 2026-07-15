import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReaderEngine } from '../ReaderEngine';
import type { EngineEventBus } from '../engineTypes';
import { SelectionDetector } from '../selectionDetector';

// Mock foliate-js for BookLoader (which is used internally)
vi.mock('foliate-js/view.js', () => ({ default: {} }));
vi.mock('../foliateAnnotations', () => ({
  installCreateOverlayListener: vi.fn().mockReturnValue(vi.fn()),
  installAnnotationRendering: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock('../androidPatches', () => ({
  enableAndroidPatches: vi.fn(),
  disableAndroidPatches: vi.fn(),
  wrapSectionLoadForAndroid: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../readerSettings', () => ({
  applyReaderFlowMode: vi.fn(),
  applyColumnMode: vi.fn(),
  applyFontSize: vi.fn(),
}));
vi.mock('../theme', () => ({
  applyTheme: vi.fn(),
  isDarkMode: vi.fn().mockReturnValue(false),
}));
vi.mock('../foliateBookMetadata', () => ({
  loadBookMetadata: vi.fn().mockResolvedValue({
    info: {
      outline: [],
      metadata: { coverUrl: null, title: null, author: null },
      totalSections: 0,
    },
    coverUrl: null,
  }),
}));
vi.mock('../foliateNavigation', () => ({
  installRelocateListener: vi.fn().mockReturnValue(vi.fn()),
  navigateFoliate: vi.fn(),
  goToSection: vi.fn(),
  goToNextPage: vi.fn(),
  goToPrevPage: vi.fn(),
  installKeyboardNavigation: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ReaderEngine', () => {
  let bus: EngineEventBus;
  let emitSpy: ReturnType<typeof vi.fn>;
  let container: HTMLDivElement;

  beforeEach(() => {
    emitSpy = vi.fn();
    bus = { emit: emitSpy as EngineEventBus['emit'] };
    container = document.createElement('div');
    // Mock global app
    (window as any).app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    };
  });

  it('starts in idle state', () => {
    const engine = new ReaderEngine(container, bus);
    expect(engine.getState()).toBe('idle');
    expect(engine.getIsLoaded()).toBe(false);
    expect(engine.getAnnotations()).toEqual([]);
    expect(engine.getView()).toBeNull();
  });

  it('close() transitions from idle to closed without error', () => {
    const engine = new ReaderEngine(container, bus);
    engine.close();
    expect(engine.getState()).toBe('closed');
  });

  it('close() is idempotent', () => {
    const engine = new ReaderEngine(container, bus);
    engine.close();
    engine.close();
    expect(engine.getState()).toBe('closed');
  });

  it('navigate throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.navigate({ href: '#ch1' })).rejects.toThrow('not ready');
  });

  it('goToSection throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.goToSection(0)).rejects.toThrow('not ready');
  });

  it('goNext throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.goNext()).rejects.toThrow('not ready');
  });

  it('goPrev throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.goPrev()).rejects.toThrow('not ready');
  });

  it('updateSettings does not throw in idle state', () => {
    const engine = new ReaderEngine(container, bus);
    expect(() => engine.updateSettings({ fontSize: 120 })).not.toThrow();
  });

  it('open() rejects when already in loading state', async () => {
    const mockView = document.createElement('div');
    Object.assign(mockView, {
      open: vi.fn().mockResolvedValue(undefined),
      init: vi.fn(),
      close: vi.fn(),
      renderer: { getContents: vi.fn().mockReturnValue([]) },
      book: { sections: [], metadata: {}, toc: [], getCover: vi.fn().mockResolvedValue(null) },
    });

    // Spy on createElement to return our mock
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'foliate-view') return mockView;
      return origCreate(tag);
    });

    const tfile = new (await import('obsidian')).TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';
    (window as any).app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(tfile);

    const engine = new ReaderEngine(container, bus);

    // First open starts loading (we won't await it)
    const openPromise = engine.open('/test.epub', 'epub');

    // Immediately try to open again - should reject
    try {
      await engine.open('/test.epub', 'epub');
      // If we get here, test fails
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.message).toContain('Cannot open');
    }

    // Wait for first open to complete to avoid unhandled rejection
    try {
      await openPromise;
    } catch {
      /* ignore */
    }

    vi.restoreAllMocks();
  });

  it('open() allows opening from closed state (engine reuse)', async () => {
    const mockView = document.createElement('div');
    Object.assign(mockView, {
      open: vi.fn().mockResolvedValue(undefined),
      init: vi.fn(),
      close: vi.fn(),
      renderer: { getContents: vi.fn().mockReturnValue([]) },
      book: { sections: [], metadata: {}, toc: [], getCover: vi.fn().mockResolvedValue(null) },
    });

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'foliate-view') return mockView;
      return origCreate(tag);
    });

    const tfile = new (await import('obsidian')).TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';
    (window as any).app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(tfile);

    const engine = new ReaderEngine(container, bus);

    // First load
    await engine.open('/test.epub', 'epub');
    expect(engine.getState()).toBe('ready');

    // Close
    engine.close();
    expect(engine.getState()).toBe('closed');

    // Re-open from closed
    await engine.open('/test.epub', 'epub');
    expect(engine.getState()).toBe('ready');

    vi.restoreAllMocks();
  });

  it('close() during loading state works (interrupt load)', async () => {
    // Create a view that never resolves
    const mockView = document.createElement('div');
    let resolveOpen: any;
    const openPromise = new Promise<void>((r) => {
      resolveOpen = r;
    });
    Object.assign(mockView, {
      open: vi.fn().mockReturnValue(openPromise),
      init: vi.fn(),
      close: vi.fn(),
      renderer: { getContents: vi.fn().mockReturnValue([]) },
      book: { sections: [], metadata: {}, toc: [], getCover: vi.fn().mockResolvedValue(null) },
    });

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'foliate-view') return mockView;
      return origCreate(tag);
    });

    const tfile = new (await import('obsidian')).TFile();
    tfile.path = '/test.epub';
    tfile.name = 'test.epub';
    (window as any).app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(tfile);

    const engine = new ReaderEngine(container, bus);

    // Start opening (will hang)
    const openP = engine.open('/test.epub', 'epub');

    // Close while loading
    engine.close();
    expect(engine.getState()).toBe('closed');

    // Resolve the open to avoid unhandled rejection
    resolveOpen();
    await openP.catch(() => {});

    vi.restoreAllMocks();
  });

  it('accepts custom SelectionDetector via constructor', () => {
    const mockDetector = {
      install: vi.fn(),
      uninstall: vi.fn(),
      findOverlappingAnnotation: vi.fn(),
    } as unknown as SelectionDetector;

    const engine = new ReaderEngine(container, bus, mockDetector);
    expect(engine).toBeDefined();
  });

  it('sectionInfo returns a copy, not reference', () => {
    const engine = new ReaderEngine(container, bus);
    const info1 = engine.getSectionInfo();
    const info2 = engine.getSectionInfo();
    expect(info1).not.toBe(info2);
    expect(info1).toEqual(info2);
  });
});
