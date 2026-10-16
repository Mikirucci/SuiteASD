import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, expect } from "vitest";

expect.extend(matchers);

// The whole suite runs in parallel on a busy machine: waiting for the screen to settle takes longer than the default
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia: motion/react reads it to detect prefers-reduced-motion
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
