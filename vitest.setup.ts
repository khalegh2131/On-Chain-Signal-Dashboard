import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Test environment shims.
 *
 * jsdom implements neither `matchMedia` nor `ResizeObserver`, and Radix's dialog
 * focuses and measures through both, so a dialog test fails on an unrelated
 * TypeError without them. They are installed only when a DOM exists, which keeps
 * this file harmless for the node suites that share it.
 */

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  });
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class NoopResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
}

if (typeof Element !== 'undefined') {
  // Radix scrolls the focused element into view and tracks pointer capture; jsdom
  // provides neither, and neither is observable in a test that does not render.
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (typeof document !== 'undefined') {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });
}
