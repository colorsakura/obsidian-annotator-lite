// Entry point: registers the <foliate-view> custom element
// Uses the GitHub version of view.js (with PDF support) adapted for esbuild
import './view.js';

// Re-export makePDF from our adapted pdf-book.ts
export { makePDF } from './pdf-book.js';
