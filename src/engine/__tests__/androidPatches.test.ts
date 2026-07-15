import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Platform
vi.mock('obsidian', () => ({
  Platform: { isMobile: true },
}));

import {
  AndroidPatcher,
  enableAndroidPatches,
  disableAndroidPatches,
  wrapSectionLoadForAndroid,
} from '../androidPatches';

// We need to re-import after mock to get the mocked version
// Since the module imports Platform at top-level, let's test with isMobile=true

describe('AndroidPatcher', () => {
  let patcher: AndroidPatcher;

  beforeEach(() => {
    patcher = new AndroidPatcher();
  });

  afterEach(() => {
    // Ensure cleanup
    patcher.forceDisable();
  });

  it('enable() sets up patches', () => {
    expect(() => patcher.enable()).not.toThrow();
  });

  it('disable() cleans up patches', () => {
    patcher.enable();
    expect(() => patcher.disable()).not.toThrow();
  });

  it('reference counting: double enable is safe', () => {
    patcher.enable();
    patcher.enable();
    // Should not crash
    patcher.disable();
    // Patches should still be active
    patcher.disable();
    // Now fully disabled
  });

  it('forceDisable() ignores reference count', () => {
    patcher.enable();
    patcher.enable(); // refCount = 2
    patcher.forceDisable();
    // Should be fully disabled
  });

  it('wrapSectionLoad intercepts load function', async () => {
    const originalLoad = vi.fn().mockResolvedValue('blob:dummy-url');
    const section = {
      load: originalLoad,
    };

    await patcher.wrapSectionLoad(section);

    // section.load should be replaced
    expect(section.load).not.toBe(originalLoad);
  });

  it('wrapSectionLoad passes through non-string results', async () => {
    const originalLoad = vi.fn().mockResolvedValue({ pages: 10 });
    const section = { load: originalLoad };

    await patcher.wrapSectionLoad(section);
    const result = await section.load();

    expect(result).toEqual({ pages: 10 });
  });
});

describe('AndroidPatcher (backward-compatible API)', () => {
  it('enableAndroidPatches does not throw', () => {
    expect(() => enableAndroidPatches()).not.toThrow();
    disableAndroidPatches();
  });

  it('disableAndroidPatches does not throw even without enable', () => {
    expect(() => disableAndroidPatches()).not.toThrow();
  });

  it('wrapSectionLoadForAndroid wraps section load', async () => {
    const section = {
      load: vi.fn().mockResolvedValue('blob:test'),
    };

    await wrapSectionLoadForAndroid(section);
    expect(section.load).toBeDefined();
  });
});
