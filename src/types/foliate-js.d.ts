declare module 'foliate-js/view.js' {
  export default class FoliateView extends HTMLElement {
    open(source: File | object): Promise<void>;
    close(): Promise<void>;
    init(options?: { showTextStart?: boolean; lastLocation?: string }): void;
    goTo(target: string | number): void;
    next(): void;
    prev(): void;
    getCFI(index: number, range: Range): string;
    resolveNavigation(cfiRange: string): { index: number };
    addAnnotation(
      annotation: { value: string; text: string; color: string },
      remove?: boolean,
    ): Promise<void>;
    deleteAnnotation(annotation: { value: string }): void;
    showAnnotation(annotation: { value: string }): Promise<void>;

    book: FoliateBook;
    renderer: FoliateRenderer;
    lastLocation: string | null;
    isFixedLayout: boolean;
  }

  interface FoliateBook {
    dir: 'ltr' | 'rtl';
    sections: FoliateSection[];
    rendition: FoliateRendition;
    metadata?: Record<string, string | undefined>;
    toc?: FoliateTocItem[];
    getCover?: () => Promise<Blob | null>;
  }

  interface FoliateSection {
    label: string;
    href: string;
    load: () => Promise<string | object | null>;
  }

  interface FoliateRendition {
    spread?: 'none' | 'always' | 'auto';
    layout?: string;
  }

  interface FoliateTocItem {
    label: string;
    href: string;
    subitems?: FoliateTocItem[];
  }

  interface FoliateRenderer extends HTMLElement {
    getContents(): FoliateContent[];
    atStart: boolean;
    atEnd: boolean;
    setStyles(css: string): void;
  }

  interface FoliateContent {
    index: number;
    doc: Document;
  }

  interface FoliateRelocateEvent extends CustomEvent {
    detail: {
      fraction: number;
      section: { current: number; total: number };
      location: { current: number; next: number; total: number };
      time: { section: number; total: number };
      tocItem?: { label: string; href: string };
      pageItem?: { label: string };
      cfi?: string;
      range?: Range;
    };
  }

  interface FoliateLoadEvent extends CustomEvent {
    detail: {
      doc: Document;
    };
  }

  interface FoliateDrawAnnotationEvent extends CustomEvent {
    detail: {
      draw: (
        drawFunc: (range: Range, options: { color: string }) => SVGGraphicsElement[],
        options?: { color: string },
      ) => void;
      annotation: { value: string; text: string; color: string };
      doc: Document;
      range: Range;
    };
  }

  interface FoliateCreateOverlayEvent extends CustomEvent {
    detail: {
      index: number;
    };
  }
}

declare module 'foliate-js/overlayer.js' {
  export const Overlayer: {
    highlight(range: Range, options: { color: string }): SVGGraphicsElement[];
    underline(range: Range, options: { color: string; width: number }): SVGGraphicsElement[];
    squiggly(range: Range, options: { color: string; width: number }): SVGGraphicsElement[];
  };
}

declare module 'foliate-js/pdf.js' {
  export function makePDF(file: File): Promise<{
    rendition: { layout: string; spread?: string };
    sections: FoliateSection[];
    metadata?: Record<string, string | undefined>;
    toc?: FoliateTocItem[];
    splitTOCHref: (href: string) => Promise<[number, null]>;
    getTOCFragment: (doc: Document) => HTMLElement;
    resolveHref: (href: string) => Promise<{ index: number }>;
    isExternal: (uri: string) => boolean;
  }>;
}

// HTMLElementTagNameMap 扩展，使 createElement('foliate-view') 返回正确类型
declare global {
  interface HTMLElementTagNameMap {
    'foliate-view': import('foliate-js/view.js').FoliateView;
  }
}
