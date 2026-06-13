/**
 * Compile-time environment constants injected by esbuild.
 * @see build.ts — define configuration
 */

declare const __DEBUG__: boolean;

/** Whether debug logging is enabled (true in dev, false in production). */
export const DEBUG: boolean = __DEBUG__;
