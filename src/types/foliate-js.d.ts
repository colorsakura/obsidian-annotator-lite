declare module 'foliate-js/view.js' {
  const _: unknown;
  export default _;
}

declare module 'foliate-js/pdf.js' {
  export const makePDF: (file: File) => Promise<{
    rendition: { layout: string; spread?: string };
    sections: { id: number; load: () => Promise<string> }[];
    metadata?: Record<string, string | undefined>;
    toc?: { label: string; href: string; subitems?: any[] }[];
    splitTOCHref: (href: string) => Promise<[number, null]>;
    getTOCFragment: (doc: Document) => HTMLElement;
    resolveHref: (href: string) => Promise<{ index: number }>;
    isExternal: (uri: string) => boolean;
  }>;
}

declare module 'foliate-js/overlayer.js' {
  export const Overlayer: {
    highlight: (range: Range, options: { color: string }) => SVGGraphicsElement[];
    underline: (range: Range, options: { color: string; width: number }) => SVGGraphicsElement[];
    squiggly: (range: Range, options: { color: string; width: number }) => SVGGraphicsElement[];
  };
}
