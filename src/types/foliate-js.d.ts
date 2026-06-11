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
    addAnnotation(annotation: { value: string; text: string; color: string }): void;
    deleteAnnotation(annotation: { value: string }): void;

    book: FoliateBook;
    renderer: FoliateRenderer;
    lastLocation: string | null;
    isFixedLayout: boolean;
  }

  interface FoliateBook {
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
    tagName: string;
    setStyles(css: string): void;
  }

  interface FoliateContent {
    index: number;
    doc: Document;
  }

  interface FoliateRelocateEvent extends CustomEvent {
    detail: {
      index: number;
      total: number;
      label: string;
      canGoPrev: boolean;
      canGoNext: boolean;
    };
  }

  interface FoliateLoadEvent extends CustomEvent {
    detail: {
      doc: Document;
    };
  }

  interface FoliateDrawAnnotationEvent extends CustomEvent {
    detail: {
      value: string;
      color: string;
    };
  }

  interface FoliateCreateOverlayEvent extends CustomEvent {
    detail: {
      value: string;
      text: string;
      color: string;
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
