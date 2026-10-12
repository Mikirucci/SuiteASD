import { describe, expect, it } from "vitest";
import { ApiError, describeError, NetworkError, parseProblem } from "./errors";

describe("parseProblem", () => {
  it("reads a full RFC 7807 body", () => {
    expect(
      parseProblem({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        code: "email_taken",
        detail: "Taken",
        errors: [{ path: "admin.email", message: "Taken" }, { nope: true }],
      }),
    ).toEqual({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      code: "email_taken",
      detail: "Taken",
      instance: undefined,
      errors: [{ path: "admin.email", message: "Taken" }],
    });
  });

  it("returns null for bodies that are not problems", () => {
    expect(parseProblem(undefined)).toBeNull();
    expect(parseProblem("oops")).toBeNull();
    expect(parseProblem({ message: "x" })).toBeNull();
  });
});

describe("describeError", () => {
  const apiError = (status: number, code = "unknown", retryAfter: number | null = null) =>
    new ApiError(status, { type: "about:blank", title: "t", status, code }, retryAfter);

  it("uses specific Italian copy for known codes", () => {
    expect(describeError(apiError(409, "email_taken"))).toContain("Esiste già un account");
  });

  it.each([
    [401, "Credenziali non valide"],
    [403, "permessi"],
    [404, "non trovato"],
    [409, "conflitto"],
    [422, "non sono validi"],
    [500, "non è disponibile"],
  ])("explains HTTP %i in plain Italian", (status, fragment) => {
    expect(describeError(apiError(status))).toContain(fragment);
  });

  it("tells how long to wait when rate limited", () => {
    expect(describeError(apiError(429, "rate_limited", 900))).toContain("15 min");
    expect(describeError(apiError(429))).toContain("qualche minuto");
  });

  it("handles network and unknown errors without leaking technical text", () => {
    expect(describeError(new NetworkError())).toContain("Impossibile contattare il server");
    expect(describeError(new Error("boom"))).toBe("Si è verificato un errore imprevisto. Riprova.");
    expect(describeError("boom")).toBe("Si è verificato un errore imprevisto. Riprova.");
  });
});
