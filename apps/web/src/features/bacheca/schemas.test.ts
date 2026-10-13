import { describe, expect, it } from "vitest";
import {
  createAnnouncementFormSchema,
  defaultPublication,
  publicationOptions,
  toCreateBody,
  toUpdateBody,
  type AnnouncementFormValues,
} from "./schemas";

const NOW = new Date("2026-11-10T10:00:00.000Z");

function values(overrides: Partial<AnnouncementFormValues> = {}): AnnouncementFormValues {
  return { title: "Palestra chiusa", body: "Sabato niente allenamento.", teamId: "", isPinned: false, publication: "now", scheduledFor: "", ...overrides };
}

describe("announcement form schema", () => {
  const schema = createAnnouncementFormSchema(NOW);

  it("requires a title and a text", () => {
    const result = schema.safeParse(values({ title: "  ", body: "" }));
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Scrivi il titolo", "Scrivi il testo della comunicazione"]);
  });

  it("asks for a future date only when the publication is scheduled", () => {
    expect(schema.safeParse(values()).success).toBe(true);
    expect(schema.safeParse(values({ publication: "scheduled" })).error?.issues[0]?.message).toBe("Scegli data e ora di pubblicazione");
    expect(schema.safeParse(values({ publication: "scheduled", scheduledFor: "2026-11-09T10:00" })).error?.issues[0]?.message).toBe(
      "La data deve essere futura",
    );
    expect(schema.safeParse(values({ publication: "scheduled", scheduledFor: "2026-12-01T18:30" })).success).toBe(true);
  });
});

describe("request bodies", () => {
  it("publishes a new announcement now by leaving publishedAt out", () => {
    expect(toCreateBody(values())).toEqual({ title: "Palestra chiusa", body: "Sabato niente allenamento.", isPinned: false });
    expect(toCreateBody(values({ teamId: "t-u16", isPinned: true }))).toEqual({
      title: "Palestra chiusa",
      body: "Sabato niente allenamento.",
      isPinned: true,
      teamId: "t-u16",
    });
  });

  it("saves a draft with a null publishedAt and a scheduled one with the chosen instant", () => {
    expect(toCreateBody(values({ publication: "draft" })).publishedAt).toBeNull();
    const scheduled = toCreateBody(values({ publication: "scheduled", scheduledFor: "2026-12-01T18:30" }));
    expect(new Date(scheduled.publishedAt ?? "").getTime()).toBe(new Date("2026-12-01T18:30").getTime());
  });

  it("clears the audience of an edited announcement with null and keeps the publication untouched", () => {
    expect(toUpdateBody(values({ publication: "keep" }), NOW)).toEqual({
      title: "Palestra chiusa",
      body: "Sabato niente allenamento.",
      isPinned: false,
      teamId: null,
    });
  });

  it("publishes an edited draft at the current instant", () => {
    expect(toUpdateBody(values({ publication: "now" }), NOW).publishedAt).toBe("2026-11-10T10:00:00.000Z");
  });
});

describe("publication choices", () => {
  it("lets a published announcement stay published or go back to draft", () => {
    expect(publicationOptions("PUBLISHED")).toEqual(["keep", "draft"]);
    expect(publicationOptions("DRAFT")).toEqual(["now", "draft", "scheduled"]);
    expect(publicationOptions(null)).toEqual(["now", "draft", "scheduled"]);
  });

  it("starts from the state the announcement is in", () => {
    expect(defaultPublication(null)).toBe("now");
    expect(defaultPublication("PUBLISHED")).toBe("keep");
    expect(defaultPublication("DRAFT")).toBe("draft");
    expect(defaultPublication("SCHEDULED")).toBe("scheduled");
  });
});
