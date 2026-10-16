import { describe, expect, it } from "vitest";
import { chipStatusOf } from "./format";

describe("chipStatusOf", () => {
  it("maps API statuses to the payment chip", () => {
    expect(chipStatusOf("PAID")).toBe("paid");
    expect(chipStatusOf("PENDING")).toBe("pending");
    expect(chipStatusOf("OVERDUE")).toBe("overdue");
    expect(chipStatusOf("CANCELLED")).toBeNull();
  });
});
