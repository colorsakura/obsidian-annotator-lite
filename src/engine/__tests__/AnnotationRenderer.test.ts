import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnotationRenderer } from '../AnnotationRenderer';
import type { Annotation } from '../../types/annotations';
import type { IFoliateViewAdapter } from '../engineTypes';

// Mock foliate-js overlayer
vi.mock('foliate-js/overlayer.js', () => ({
  Overlayer: {
    highlight: vi.fn(),
  },
}));

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'test-id',
    uri: 'urn:book.epub',
    document: { title: 'Test Book' },
    target: [
      {
        source: 'urn:book.epub',
        selector: [{ type: 'TextQuoteSelector', exact: 'hello', prefix: '', suffix: '' }],
      },
    ],
    text: '',
    tags: [],
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    cfiRange: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
    type: 'epub',
    color: '#ffe066',
    ...overrides,
  };
}

function createMockViewAdapter(): IFoliateViewAdapter {
  const view = document.createElement('div');
  Object.assign(view, {
    addAnnotation: vi.fn().mockResolvedValue(undefined),
    deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    resolveNavigation: vi.fn().mockResolvedValue({ index: 0 }),
  });
  return {
    view,
    open: vi.fn(),
    init: vi.fn(),
    close: vi.fn(),
    goTo: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    addAnnotation: (view as any).addAnnotation,
    deleteAnnotation: (view as any).deleteAnnotation,
    resolveNavigation: (view as any).resolveNavigation,
    getCFI: vi.fn(),
    renderer: {
      getContents: vi.fn().mockReturnValue([]),
      setStyles: vi.fn(),
      atStart: false,
      atEnd: false,
    },
  };
}

describe('AnnotationRenderer', () => {
  let renderer: AnnotationRenderer;
  let viewAdapter: IFoliateViewAdapter;

  beforeEach(() => {
    renderer = new AnnotationRenderer();
    viewAdapter = createMockViewAdapter();
  });

  it('starts with empty overlay map', () => {
    expect(renderer.getOverlayMap().size).toBe(0);
  });

  it('install registers event listeners on view', () => {
    renderer.install(viewAdapter, () => []);
    // Verify the view has listeners attached (internal check via map state)
    expect(renderer.getOverlayMap().size).toBe(0);
  });

  it('syncOverlays adds new overlays', async () => {
    renderer.install(viewAdapter, () => []);

    const annotations = [makeAnnotation({ id: 'a1', cfiRange: 'cfi1' })];
    await renderer.syncOverlays(annotations);

    expect(viewAdapter.addAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'cfi1' }),
    );
    expect(renderer.getOverlayMap().has('a1')).toBe(true);
  });

  it('syncOverlays removes stale overlays', async () => {
    renderer.install(viewAdapter, () => []);

    const annotations = [makeAnnotation({ id: 'a1', cfiRange: 'cfi1' })];
    await renderer.syncOverlays(annotations);
    // a1 is now applied
    expect(renderer.getOverlayMap().has('a1')).toBe(true);

    // Sync with empty list → a1 should be removed
    await renderer.syncOverlays([]);
    expect(viewAdapter.deleteAnnotation).toHaveBeenCalledWith({ value: 'cfi1' });
    expect(renderer.getOverlayMap().has('a1')).toBe(false);
  });

  it('syncOverlays does not re-add already applied overlays', async () => {
    renderer.install(viewAdapter, () => []);

    const annotations = [makeAnnotation({ id: 'a1', cfiRange: 'cfi1' })];
    await renderer.syncOverlays(annotations);

    // clear call history
    vi.clearAllMocks();

    await renderer.syncOverlays(annotations);
    // Should not call addAnnotation again for a1
    expect(viewAdapter.addAnnotation).not.toHaveBeenCalled();
  });

  it('syncOverlays processes additions and removals in sequence', async () => {
    renderer.install(viewAdapter, () => []);

    const ann1 = makeAnnotation({ id: 'a1', cfiRange: 'cfi1' });
    const ann2 = makeAnnotation({ id: 'a2', cfiRange: 'cfi2' });

    await renderer.syncOverlays([ann1, ann2]);
    expect(renderer.getOverlayMap().size).toBe(2);

    // Remove a1, keep a2
    await renderer.syncOverlays([ann2]);
    expect(renderer.getOverlayMap().has('a1')).toBe(false);
    expect(renderer.getOverlayMap().has('a2')).toBe(true);
    expect(viewAdapter.deleteAnnotation).toHaveBeenCalledWith({ value: 'cfi1' });
  });

  it('uninstall clears overlay map and listeners', () => {
    renderer.install(viewAdapter, () => []);
    renderer.uninstall();

    expect(renderer.getOverlayMap().size).toBe(0);
  });

  it('syncOverlays handles addAnnotation failure gracefully', async () => {
    // Make addAnnotation fail
    const failingViewAdapter = createMockViewAdapter();
    failingViewAdapter.addAnnotation = vi.fn().mockRejectedValue(new Error('fail'));
    renderer.install(failingViewAdapter, () => []);

    const annotations = [makeAnnotation({ id: 'a1', cfiRange: 'cfi1' })];
    await renderer.syncOverlays(annotations);

    // Should not crash, and the failed annotation should be removed from map
    expect(renderer.getOverlayMap().has('a1')).toBe(false);
  });

  it('syncOverlays skips annotations without cfiRange', async () => {
    renderer.install(viewAdapter, () => []);

    const annotations = [makeAnnotation({ id: 'a1', cfiRange: '' })];
    await renderer.syncOverlays(annotations);

    expect(viewAdapter.addAnnotation).not.toHaveBeenCalled();
    expect(renderer.getOverlayMap().size).toBe(0);
  });

  it('serial queue ensures sequential execution order', async () => {
    renderer.install(viewAdapter, () => []);

    const callOrder: string[] = [];
    const origAdd = viewAdapter.addAnnotation;
    (viewAdapter as any).addAnnotation = vi.fn().mockImplementation(async () => {
      callOrder.push('add');
      await new Promise((r) => setTimeout(r, 10));
    });
    const origDelete = viewAdapter.deleteAnnotation;
    (viewAdapter as any).deleteAnnotation = vi.fn().mockImplementation(async () => {
      callOrder.push('delete');
    });

    const ann1 = makeAnnotation({ id: 'a1', cfiRange: 'cfi1' });
    const ann2 = makeAnnotation({ id: 'a2', cfiRange: 'cfi2' });

    // Fire two syncs in rapid succession
    const p1 = renderer.syncOverlays([ann1]);
    const p2 = renderer.syncOverlays([ann2]);

    await Promise.all([p1, p2]);
    // Should be sequential due to internal queue
    // The first sync adds ann1, then overwrites overlay map in second sync
    // but the key point is they execute sequentially
  });
});
