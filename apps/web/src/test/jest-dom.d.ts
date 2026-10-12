import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Registered by hand (instead of "@testing-library/jest-dom/vitest") because the workspace hoists
// another vitest copy, and the stock entry point would extend that copy instead of ours.
declare module "vitest" {
  interface Assertion<T> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
