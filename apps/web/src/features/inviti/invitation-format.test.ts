import { describe, expect, it } from "vitest";
import { describeInvitationExpiry, invitableRoles, invitationLink } from "./invitation-format";

describe("invitableRoles", () => {
  it("lets an admin invite every role of the administration", () => {
    expect(invitableRoles(["ADMIN"])).toEqual(["ADMIN", "SEGRETERIA", "ALLENATORE", "STAFF"]);
  });

  it("keeps the secretary from granting more than they have", () => {
    expect(invitableRoles(["SEGRETERIA"])).toEqual(["ALLENATORE", "STAFF"]);
  });

  it("offers nothing to the roles that cannot invite", () => {
    expect(invitableRoles(["ALLENATORE"])).toEqual([]);
    expect(invitableRoles(["ATLETA", "GENITORE"])).toEqual([]);
    expect(invitableRoles([])).toEqual([]);
  });

  it("merges the roles of a person who has several", () => {
    expect(invitableRoles(["SEGRETERIA", "ADMIN"])).toEqual(["ADMIN", "SEGRETERIA", "ALLENATORE", "STAFF"]);
  });
});

describe("invitationLink", () => {
  it("points to the public acceptance page", () => {
    expect(invitationLink("https://app.example.test", "abc_DEF-123")).toBe("https://app.example.test/invito/abc_DEF-123");
  });
});

describe("describeInvitationExpiry", () => {
  // Local times, so the calendar days do not depend on the timezone of the machine
  const now = new Date(2026, 9, 17, 10, 0);

  it.each([
    [new Date(2026, 9, 17, 23, 0), "Scade oggi"],
    [new Date(2026, 9, 18, 9, 0), "Scade domani"],
    [new Date(2026, 9, 24, 9, 0), "Scade tra 7 giorni"],
    [new Date(2026, 10, 2, 9, 0), "Scade tra 16 giorni"],
    [new Date(2026, 9, 16, 9, 0), "Scade oggi"],
  ])("%s -> %s", (expiresAt, label) => {
    expect(describeInvitationExpiry(expiresAt.toISOString(), now)).toBe(label);
  });
});
