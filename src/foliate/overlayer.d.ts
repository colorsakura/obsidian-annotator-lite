declare module 'foliate-js/overlayer.js' {
  export const Overlayer: {
    highlight: (range: Range, options: { color: string }) => SVGGraphicsElement[];
    underline: (range: Range, options: { color: string; width: number }) => SVGGraphicsElement[];
    squiggly: (range: Range, options: { color: string; width: number }) => SVGGraphicsElement[];
  };
}
