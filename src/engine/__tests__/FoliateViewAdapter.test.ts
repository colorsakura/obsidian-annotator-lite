import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FoliateViewAdapter } from '../FoliateViewAdapter';

describe('FoliateViewAdapter', () => {
  let mockView: HTMLElement;
  let adapter: FoliateViewAdapter;

  beforeEach(() => {
    mockView = document.createElement('div');
    // mock foliate-js API
    Object.assign(mockView, {
      open: vi.fn().mockResolvedValue(undefined),
      init: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      goTo: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      addAnnotation: vi.fn().mockResolvedValue(undefined),
      deleteAnnotation: vi.fn().mockResolvedValue(undefined),
      resolveNavigation: vi.fn().mockResolvedValue({ index: 0 }),
      getCFI: vi.fn().mockReturnValue('epubcfi(/6/4!/4/2/1:0)'),
      renderer: {
        getContents: vi.fn().mockReturnValue([]),
        setStyles: vi.fn(),
        atStart: false,
        atEnd: false,
      },
    });
    adapter = new FoliateViewAdapter(mockView);
  });

  it('exposes the underlying view element', () => {
    expect(adapter.view).toBe(mockView);
  });

  it('delegates open() to view.open()', async () => {
    await adapter.open({});
    expect((mockView as any).open).toHaveBeenCalled();
  });

  it('delegates init() to view.init()', async () => {
    await adapter.init({ showTextStart: true });
    expect((mockView as any).init).toHaveBeenCalledWith({ showTextStart: true });
  });

  it('delegates close() to view.close()', () => {
    adapter.close();
    expect((mockView as any).close).toHaveBeenCalled();
  });

  it('close() handles missing close method gracefully', () => {
    const viewWithoutClose = document.createElement('div');
    const a = new FoliateViewAdapter(viewWithoutClose);
    expect(() => a.close()).not.toThrow();
  });

  it('delegates goTo() to view.goTo()', () => {
    adapter.goTo('#chapter1');
    expect((mockView as any).goTo).toHaveBeenCalledWith('#chapter1');
  });

  it('delegates next() to view.next()', () => {
    adapter.next();
    expect((mockView as any).next).toHaveBeenCalled();
  });

  it('delegates prev() to view.prev()', () => {
    adapter.prev();
    expect((mockView as any).prev).toHaveBeenCalled();
  });

  it('delegates addAnnotation() to view.addAnnotation()', async () => {
    await adapter.addAnnotation({ value: 'cfi', text: 'hello', color: '#ff0' });
    expect((mockView as any).addAnnotation).toHaveBeenCalledWith({
      value: 'cfi',
      text: 'hello',
      color: '#ff0',
    });
  });

  it('delegates deleteAnnotation() to view.deleteAnnotation()', async () => {
    await adapter.deleteAnnotation({ value: 'cfi' });
    expect((mockView as any).deleteAnnotation).toHaveBeenCalledWith({ value: 'cfi' });
  });

  it('delegates resolveNavigation() to view.resolveNavigation()', async () => {
    const result = await adapter.resolveNavigation('cfi123');
    expect((mockView as any).resolveNavigation).toHaveBeenCalledWith('cfi123');
    expect(result).toEqual({ index: 0 });
  });

  it('resolveNavigation returns null when view returns null', async () => {
    (mockView as any).resolveNavigation.mockResolvedValue(null);
    const result = await adapter.resolveNavigation('cfi123');
    expect(result).toBeNull();
  });

  it('delegates getCFI() to view.getCFI()', () => {
    const range = {} as Range;
    const cfi = adapter.getCFI(0, range);
    expect((mockView as any).getCFI).toHaveBeenCalledWith(0, range);
    expect(cfi).toBe('epubcfi(/6/4!/4/2/1:0)');
  });

  it('exposes renderer adapter', () => {
    expect(adapter.renderer).toBeDefined();
    expect(adapter.renderer.getContents).toBeDefined();
    expect(adapter.renderer.setStyles).toBeDefined();
    expect(adapter.renderer.atStart).toBe(false);
    expect(adapter.renderer.atEnd).toBe(false);
  });
});
