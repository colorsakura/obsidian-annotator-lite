import { describe, it, expectTypeOf } from 'vitest';
import type {
  EngineEventMap,
  EngineEventBus,
  ReaderSettings,
  OpenOptions,
  AddAnnotationParams,
} from './engineTypes';
import type { Annotation, OutlineItem, BookMetadata } from '../types/annotations';
import type { ReaderSectionState } from '../services/ReaderSessionStore';

describe('EngineEventMap', () => {
  it('defines all required events', () => {
    expectTypeOf<EngineEventMap['outline-loaded']>().toEqualTypeOf<{ items: OutlineItem[] }>();
    expectTypeOf<EngineEventMap['metadata-loaded']>().toEqualTypeOf<{ metadata: BookMetadata }>();
    expectTypeOf<EngineEventMap['section-changed']>().toEqualTypeOf<{ section: ReaderSectionState }>();
    expectTypeOf<EngineEventMap['annotations-changed']>().toEqualTypeOf<{ annotations: Annotation[] }>();
    expectTypeOf<EngineEventMap['location-changed']>().toEqualTypeOf<{ cfi: string; sectionIndex: number }>();
  });

  it('defines selection event', () => {
    expectTypeOf<EngineEventMap['selection']>().toMatchObjectType<{
      position: { x: number; y: number };
    }>();
  });
});

describe('EngineEventBus', () => {
  it('has emit method with correct signature', () => {
    expectTypeOf<EngineEventBus['emit']>().toBeFunction();
  });
});

describe('ReaderSettings', () => {
  it('has all required fields', () => {
    expectTypeOf<ReaderSettings['flowMode']>().toEqualTypeOf<'paginated' | 'scrolled'>();
    expectTypeOf<ReaderSettings['columnMode']>().toEqualTypeOf<'single' | 'double'>();
    expectTypeOf<ReaderSettings['fontSize']>().toEqualTypeOf<number>();
  });
});
