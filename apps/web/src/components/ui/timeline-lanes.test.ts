import { describe, expect, it } from "vitest";
import { assignLanes } from "./timeline-lanes";

describe("assignLanes", () => {
  it("keeps distant avatars on the same row", () => {
    expect(assignLanes([20, 120, 300], 44, 4)).toEqual([0, 0, 0]);
  });

  it("moves an avatar to the next row when it would cover the previous one", () => {
    expect(assignLanes([100, 110, 120, 200], 44, 4)).toEqual([0, 1, 2, 0]);
  });

  it("reuses a lower row as soon as there is room", () => {
    expect(assignLanes([100, 110, 160], 44, 4)).toEqual([0, 1, 0]);
  });

  it("never creates more rows than allowed", () => {
    const lanes = assignLanes([100, 101, 102, 103, 104, 105], 44, 3);
    expect(Math.max(...lanes)).toBe(2);
  });

  it("returns nothing for no items", () => {
    expect(assignLanes([], 44, 4)).toEqual([]);
  });
});
