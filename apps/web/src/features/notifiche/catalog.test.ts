import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES, TYPE_INFO } from "./catalog";

describe("notification catalog: payments", () => {
  it("offers a label for the reported payment and for the issued receipt", () => {
    expect(TYPE_INFO.ADMIN_PAYMENT_CLAIMED.label).toBe("Pagamenti segnalati");
    expect(TYPE_INFO.RECEIPT_ISSUED.label).toBe("Ricevute");
  });

  it("lists every type once, so that preferences and filters can show them", () => {
    expect(NOTIFICATION_TYPES).toContain("ADMIN_PAYMENT_CLAIMED");
    expect(NOTIFICATION_TYPES).toContain("RECEIPT_ISSUED");
    expect(new Set(NOTIFICATION_TYPES).size).toBe(NOTIFICATION_TYPES.length);
    expect(Object.keys(TYPE_INFO).sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });
});
