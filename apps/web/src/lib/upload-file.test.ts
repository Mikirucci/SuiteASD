import { describe, expect, it } from "vitest";
import { validateUploadFile } from "./upload-file";

describe("validateUploadFile", () => {
  it("accepts PDF and photos up to 5 MB", () => {
    expect(validateUploadFile(new File(["x"], "c.pdf", { type: "application/pdf" }))).toBeNull();
    expect(validateUploadFile(new File(["x"], "c.jpg", { type: "image/jpeg" }))).toBeNull();
  });

  it("explains why a file is refused", () => {
    expect(validateUploadFile(new File(["x"], "c.docx", { type: "application/msword" }))).toMatch(/PDF/);
    expect(validateUploadFile(new File([], "c.pdf", { type: "application/pdf" }))).toBe("Il file è vuoto.");
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "c.pdf", { type: "application/pdf" });
    expect(validateUploadFile(big)).toMatch(/il massimo è 5,0 MB/);
  });
});
