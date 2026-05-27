// Adapted from https://github.com/johnfactotum/foliate-js/blob/main/pdf.js
// Modified for esbuild-bundled Obsidian plugin environment:
// - Uses static pdfjs-dist import instead of vendored bundle
// - Uses blob URL for worker (inlined via esbuild define)
// - Inlines CSS content (injected via esbuild define)
// - Uses CDN URLs for cmaps and standard_fonts

import * as pdfjsLib from 'pdfjs-dist';

// Injected by esbuild define at build time
declare const __PDF_WORKER_CODE__: string;
declare const __TEXT_LAYER_CSS__: string;
declare const __ANNOTATION_LAYER_CSS__: string;

let workerBlobUrl: string | null = null;

function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([__PDF_WORKER_CODE__], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = getWorkerBlobUrl();

// CDN paths for cmaps and standard fonts
const CMAP_URL = 'https://unpkg.com/pdfjs-dist@5.5.207/cmaps/';
const STANDARD_FONT_URL = 'https://unpkg.com/pdfjs-dist@5.5.207/standard_fonts/';

const render = async (page: any, doc: Document, zoom: number) => {
  const viewport = page.getViewport({ scale: zoom });

  const canvas = document.createElement('canvas');
  const dpr = devicePixelRatio || 1;
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const canvasContext = canvas.getContext('2d')!;
  canvasContext.scale(dpr, dpr);
  await page.render({ canvasContext, viewport }).promise;
  doc.querySelector('#canvas')!.replaceChildren(doc.adoptNode(canvas));

  const container = doc.querySelector('.textLayer') as HTMLElement;
  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: await page.streamTextContent(),
    container,
    viewport,
  });
  await textLayer.render();

  const endOfContent = document.createElement('div');
  endOfContent.className = 'endOfContent';
  container.append(endOfContent);
  container.onpointerdown = () => container.classList.add('selecting');
  container.onpointerup = () => container.classList.remove('selecting');

  const div = doc.querySelector('.annotationLayer') as HTMLElement;
  const linkService = {
    goToDestination: () => {},
    getDestinationHash: (dest: any) => JSON.stringify(dest),
    addLinkAttributes: (link: HTMLAnchorElement, url: string) => {
      link.href = url;
    },
  };
  const AnnotationLayer = (pdfjsLib as any).AnnotationLayer;
  await new AnnotationLayer({
    page,
    viewport,
    div,
    linkService,
    accessibilityManager: null,
    annotationCanvasMap: new Map(),
    annotationEditorUIManager: null,
    structTreeLayer: null,
    commentManager: null,
    annotationStorage: null,
  }).render({
    viewport,
    div,
    page,
    linkService,
    annotations: await page.getAnnotations(),
    renderForms: false,
  });
};

type PageResult = {
  src: string;
  onZoom: (opts: { doc: Document; scale: number }) => Promise<void>;
};

const renderPage = async (page: any, getImageBlob?: boolean): Promise<Blob | PageResult> => {
  const viewport = page.getViewport({ scale: 1 });
  if (getImageBlob) {
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const canvasContext = canvas.getContext('2d')!;
    await page.render({ canvasContext, viewport }).promise;
    return new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
  }
  const src = URL.createObjectURL(
    new Blob(
      [
        `
        <!DOCTYPE html>
        <html lang="en">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
        html, body {
            margin: 0;
            padding: 0;
        }
        :root {
            --user-unit: 1;
            --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
            --scale-round-x: 1px;
            --scale-round-y: 1px;
        }
        ${__TEXT_LAYER_CSS__}
        ${__ANNOTATION_LAYER_CSS__}
        </style>
        <div id="canvas"></div>
        <div class="textLayer"></div>
        <div class="annotationLayer"></div>
    `,
      ],
      { type: 'text/html' },
    ),
  );
  const onZoom = ({ doc, scale }: { doc: Document; scale: number }) => render(page, doc, scale);
  return { src, onZoom };
};

const makeTOCItem = (item: any) => ({
  label: item.title,
  href: JSON.stringify(item.dest),
  subitems: item.items.length ? item.items.map(makeTOCItem) : null,
});

export const makePDF = async (file: Blob) => {
  const PDFDataRangeTransport = (pdfjsLib as any).PDFDataRangeTransport;
  const transport = new PDFDataRangeTransport(file.size, []);
  transport.requestDataRange = (begin: number, end: number) => {
    file
      .slice(begin, end)
      .arrayBuffer()
      .then((chunk: ArrayBuffer) => {
        transport.onDataRange(begin, chunk);
      });
  };
  const pdf = await pdfjsLib.getDocument({
    range: transport,
    cMapUrl: CMAP_URL,
    standardFontDataUrl: STANDARD_FONT_URL,
    isEvalSupported: false,
  } as any).promise;

  const book: any = {};

  const { metadata, info } = (await pdf.getMetadata()) ?? ({} as any);
  book.metadata = {
    title: metadata?.get('dc:title') ?? (info as any)?.Title,
    author: metadata?.get('dc:creator') ?? (info as any)?.Author,
    contributor: metadata?.get('dc:contributor'),
    description: metadata?.get('dc:description') ?? (info as any)?.Subject,
    language: metadata?.get('dc:language'),
    publisher: metadata?.get('dc:publisher'),
    subject: metadata?.get('dc:subject'),
    identifier: metadata?.get('dc:identifier'),
    source: metadata?.get('dc:source'),
    rights: metadata?.get('dc:rights'),
  };

  const outline = await pdf.getOutline();
  book.toc = outline?.map(makeTOCItem);

  // Cache holds { src, onZoom } for each page
  const cache = new Map<number, PageResult>();

  book.sections = Array.from({ length: pdf.numPages }).map((_: any, i: number) => ({
    id: i,
    load: async () => {
      const cached = cache.get(i);
      if (cached) return cached.src;
      const result = (await renderPage(await pdf.getPage(i + 1))) as PageResult;
      cache.set(i, result);
      return result.src;
    },
    // Called by the paginator load-event hook to render content into the iframe
    render: async (doc: Document) => {
      let cached = cache.get(i);
      if (!cached) {
        cached = (await renderPage(await pdf.getPage(i + 1))) as PageResult;
        cache.set(i, cached);
      }
      await cached.onZoom({ doc, scale: 1 });
    },
    size: 1000,
  }));
  book.isExternal = (uri: string) => /^\w+:/i.test(uri);
  book.resolveHref = async (href: string) => {
    const parsed = JSON.parse(href);
    const dest = typeof parsed === 'string' ? await pdf.getDestination(parsed) : parsed;
    const index = await pdf.getPageIndex(dest[0]);
    return { index };
  };
  book.splitTOCHref = async (href: string) => {
    const parsed = JSON.parse(href);
    const dest = typeof parsed === 'string' ? await pdf.getDestination(parsed) : parsed;
    const index = await pdf.getPageIndex(dest[0]);
    return [index, null];
  };
  book.getTOCFragment = (doc: Document) => doc.documentElement;
  book.getCover = async () => renderPage(await pdf.getPage(1), true);
  book.destroy = () => pdf.destroy();
  return book;
};
