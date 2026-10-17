import { describe, expect, it } from "vitest";
import { canBeClaimed, chipStatusOf, claimNote, isUnpaid } from "./format";
import { CLAIMED_FEE, OVERDUE_FEE, PAID_FEE, PENDING_FEE, makeFee } from "./test-support";

describe("chipStatusOf", () => {
  it("maps API statuses to the payment chip", () => {
    expect(chipStatusOf("PAID")).toBe("paid");
    expect(chipStatusOf("PENDING")).toBe("pending");
    expect(chipStatusOf("OVERDUE")).toBe("overdue");
    expect(chipStatusOf("CANCELLED")).toBeNull();
  });
});

describe("isUnpaid and canBeClaimed", () => {
  it("treat pending and overdue fees as unpaid, paid and cancelled ones as settled", () => {
    expect(isUnpaid(PENDING_FEE)).toBe(true);
    expect(isUnpaid(OVERDUE_FEE)).toBe(true);
    expect(isUnpaid(PAID_FEE)).toBe(false);
    expect(isUnpaid(makeFee({ status: "CANCELLED" }))).toBe(false);
  });

  it("allow the report only on an unpaid fee not reported yet", () => {
    expect(canBeClaimed(PENDING_FEE)).toBe(true);
    expect(canBeClaimed(OVERDUE_FEE)).toBe(true);
    expect(canBeClaimed(CLAIMED_FEE)).toBe(false);
    expect(canBeClaimed(PAID_FEE)).toBe(false);
  });
});

describe("claimNote", () => {
  it("tells the payer the fee waits for a check, in neutral words", () => {
    expect(claimNote(CLAIMED_FEE, "payer")).toBe("Segnalato il 8 nov 2026: in attesa di verifica");
  });

  it("tells the secretariat who reported", () => {
    expect(claimNote(CLAIMED_FEE, "secretariat")).toBe("Segnalato dal pagante il 8 nov 2026");
  });

  it("says nothing when the fee was never reported or is already settled", () => {
    expect(claimNote(PENDING_FEE, "payer")).toBeNull();
    expect(claimNote({ ...PAID_FEE, claimedAt: "2026-11-01T09:00:00.000Z", status: "PAID" }, "payer")).toBeNull();
  });
});
