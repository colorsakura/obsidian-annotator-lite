import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectionDetector } from '../selectionDetector';
import type { EngineEventBus } from '../engineTypes';
import type { Annotation } from '../../types/annotations';

describe('SelectionDetector', () => {
  let bus: EngineEventBus;
  let emitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emitSpy = vi.fn();
    bus = { emit: emitSpy as EngineEventBus['emit'] };
  });

  it('findOverlappingAnnotation returns undefined when no match', () => {
    const detector = new SelectionDetector(bus);
    const result = detector.findOverlappingAnnotation('epubcfi(/6/4[chap01]!/4/2/1:0)', []);
    expect(result).toBeUndefined();
  });

  it('findOverlappingAnnotation returns matching annotation by cfiRange', () => {
    const detector = new SelectionDetector(bus);
    const ann: Annotation = {
      id: 'a1',
      uri: 'urn:book.epub',
      document: { title: 'Test' },
      target: [],
      text: '',
      tags: [],
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      cfiRange: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      type: 'epub',
    };

    const result = detector.findOverlappingAnnotation('epubcfi(/6/4[chap01]!/4/2/1:0)', [ann]);
    expect(result).toBe(ann);
  });

  it('findOverlappingAnnotation returns undefined for non-matching cfi', () => {
    const detector = new SelectionDetector(bus);
    const ann: Annotation = {
      id: 'a1',
      uri: 'urn:book.epub',
      document: { title: 'Test' },
      target: [],
      text: '',
      tags: [],
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
      cfiRange: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      type: 'epub',
    };

    const result = detector.findOverlappingAnnotation('epubcfi(/6/4[chap02]!/4/2/1:0)', [ann]);
    expect(result).toBeUndefined();
  });

  it('install sets up event listeners on view', () => {
    const detector = new SelectionDetector(bus);

    const mockView = document.createElement('div') as HTMLElement;
    const mockRenderer = {
      getContents: vi.fn().mockReturnValue([]),
    };
    (mockView as any).renderer = mockRenderer;
    (mockView as any).addEventListener = vi.fn();

    const getAnnotations = vi.fn().mockReturnValue([]);

    expect(() => detector.install(mockView, 'epub', getAnnotations)).not.toThrow();
    expect((mockView as any).addEventListener).toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('install clears previous listeners before installing new', () => {
    const detector = new SelectionDetector(bus);

    const mockView = document.createElement('div') as HTMLElement;
    const mockRenderer = {
      getContents: vi.fn().mockReturnValue([]),
    };
    (mockView as any).renderer = mockRenderer;

    const addEventListenerSpy = vi.fn();
    (mockView as any).addEventListener = addEventListenerSpy;

    const getAnnotations = vi.fn().mockReturnValue([]);

    // Install twice
    detector.install(mockView, 'epub', getAnnotations);
    detector.install(mockView, 'epub', getAnnotations);

    // Should have called addEventListener twice (once per install)
    expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
  });

  it('uninstall clears all listeners', () => {
    const detector = new SelectionDetector(bus);
    detector.uninstall();
    // Should not throw
  });

  it('install with renderer contents sets up iframe listeners', () => {
    const detector = new SelectionDetector(bus);

    const mockDoc = {
      defaultView: {
        getSelection: vi.fn().mockReturnValue(null),
        frameElement: null,
      },
      addEventListener: vi.fn(),
    };

    const mockView = document.createElement('div') as HTMLElement;
    const mockRenderer = {
      getContents: vi.fn().mockReturnValue([{ index: 0, doc: mockDoc }]),
    };
    (mockView as any).renderer = mockRenderer;

    const addEventListenerSpy = vi.fn();
    (mockView as any).addEventListener = addEventListenerSpy;

    const getAnnotations = vi.fn().mockReturnValue([]);

    detector.install(mockView, 'epub', getAnnotations);

    // contextmenu listener should have been installed on mockDoc
    expect(mockDoc.addEventListener).toHaveBeenCalledWith('contextmenu', expect.any(Function));
  });

  it('contextmenu handler does nothing on collapsed selection', () => {
    const detector = new SelectionDetector(bus);

    const mockSelection = {
      isCollapsed: true,
      rangeCount: 0,
    };

    const mockDoc = {
      defaultView: {
        getSelection: vi.fn().mockReturnValue(mockSelection),
        frameElement: null,
      },
      addEventListener: vi.fn(),
    };

    const mockView = document.createElement('div') as HTMLElement;
    (mockView as any).renderer = {
      getContents: vi.fn().mockReturnValue([{ index: 0, doc: mockDoc }]),
    };

    const getAnnotations = vi.fn().mockReturnValue([]);

    detector.install(mockView, 'epub', getAnnotations);

    // Simulate contextmenu with collapsed selection
    const contextHandler = mockDoc.addEventListener.mock.calls[0][1];
    const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    contextHandler(mockEvent);

    // Should not emit
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
