import { describe, expect, it } from "vitest";
import { hasAdministration, hasPersonalArea } from "./areas";

describe("areas of the app", () => {
  it.each([
    [["ADMIN"], true, false],
    [["SEGRETERIA"], true, false],
    [["ALLENATORE"], true, false],
    [["STAFF"], true, false],
    [["ATLETA"], false, true],
    [["GENITORE"], false, true],
    [["ADMIN", "GENITORE"], true, true],
    [["ALLENATORE", "ATLETA"], true, true],
    [[], false, false],
  ] as const)("%j: administration %s, personal area %s", (roles, administration, personal) => {
    expect(hasAdministration(roles)).toBe(administration);
    expect(hasPersonalArea(roles)).toBe(personal);
  });
});
