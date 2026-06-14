import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReaderEngine } from './ReaderEngine';
import type { EngineEventBus } from './engineTypes';

describe('ReaderEngine', () => {
  let bus: EngineEventBus;
  let emitSpy: ReturnType<typeof vi.fn>;
  let container: HTMLDivElement;

  beforeEach(() => {
    emitSpy = vi.fn();
    bus = { emit: emitSpy };
    container = document.createElement('div');
  });

  it('starts in idle state', () => {
    const engine = new ReaderEngine(container, bus);
    expect(engine.getState()).toBe('idle');
    expect(engine.getIsLoaded()).toBe(false);
    expect(engine.getAnnotations()).toEqual([]);
    expect(engine.getView()).toBeNull();
  });

  it('close() transitions from idle to closed without error', () => {
    const engine = new ReaderEngine(container, bus);
    engine.close();
    expect(engine.getState()).toBe('closed');
  });

  it('close() is idempotent', () => {
    const engine = new ReaderEngine(container, bus);
    engine.close();
    engine.close();
    expect(engine.getState()).toBe('closed');
  });

  it('navigate throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.navigate({ href: '#ch1' })).rejects.toThrow('not ready');
  });

  it('goToSection throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.goToSection(0)).rejects.toThrow('not ready');
  });

  it('goNext throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.goNext()).rejects.toThrow('not ready');
  });

  it('goPrev throws when not ready', async () => {
    const engine = new ReaderEngine(container, bus);
    await expect(engine.goPrev()).rejects.toThrow('not ready');
  });

  it('updateSettings does not throw in idle state', () => {
    const engine = new ReaderEngine(container, bus);
    expect(() => engine.updateSettings({ fontSize: 120 })).not.toThrow();
  });
});
