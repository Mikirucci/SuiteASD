import { z } from "zod";
import { fromLocalInput } from "@/features/classifiche/format";
import type { AnnouncementStatus, CreateAnnouncementBody, UpdateAnnouncementBody } from "./types";

/** Limits mirror apps/api/src/modules/announcements/schema.ts so most mistakes are caught before the request. */

export type Publication = "keep" | "now" | "draft" | "scheduled";

export const PUBLICATION_LABELS: Record<Publication, string> = {
  keep: "Resta pubblicata",
  now: "Pubblica subito",
  draft: "Salva come bozza",
  scheduled: "Programma la pubblicazione",
};

/** Choices offered by the form: a published announcement can stay published or go back to draft. */
export function publicationOptions(editing: AnnouncementStatus | null): Publication[] {
  return editing === "PUBLISHED" ? ["keep", "draft"] : ["now", "draft", "scheduled"];
}

export function defaultPublication(editing: AnnouncementStatus | null): Publication {
  if (editing === "PUBLISHED") return "keep";
  if (editing === "DRAFT") return "draft";
  if (editing === "SCHEDULED") return "scheduled";
  return "now";
}

export function createAnnouncementFormSchema(now: Date = new Date()) {
  return z
    .object({
      title: z.string().trim().min(1, "Scrivi il titolo").max(160, "Massimo 160 caratteri"),
      body: z.string().trim().min(1, "Scrivi il testo della comunicazione").max(5000, "Massimo 5000 caratteri"),
      teamId: z.string(),
      isPinned: z.boolean(),
      publication: z.enum(["keep", "now", "draft", "scheduled"]),
      scheduledFor: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.publication !== "scheduled") return;
      const at = fromLocalInput(values.scheduledFor);
      if (at === undefined || Number.isNaN(new Date(at).getTime())) {
        ctx.addIssue({ code: "custom", path: ["scheduledFor"], message: "Scegli data e ora di pubblicazione" });
      } else if (new Date(at) <= now) {
        ctx.addIssue({ code: "custom", path: ["scheduledFor"], message: "La data deve essere futura" });
      }
    });
}

export type AnnouncementFormValues = z.infer<ReturnType<typeof createAnnouncementFormSchema>>;

function publishedAtOf(values: AnnouncementFormValues, now: Date): string | null | undefined {
  switch (values.publication) {
    case "keep":
      return undefined;
    case "now":
      return now.toISOString();
    case "draft":
      return null;
    case "scheduled":
      return fromLocalInput(values.scheduledFor);
  }
}

/** POST body: a new announcement published "now" omits `publishedAt`, so the server stamps the instant. */
export function toCreateBody(values: AnnouncementFormValues): CreateAnnouncementBody {
  const body: CreateAnnouncementBody = { title: values.title, body: values.body, isPinned: values.isPinned };
  if (values.teamId) body.teamId = values.teamId;
  const publishedAt = values.publication === "now" ? undefined : publishedAtOf(values, new Date());
  if (publishedAt !== undefined) body.publishedAt = publishedAt;
  return body;
}

/** PATCH body: sends the whole form; an audience cleared to "tutta la società" is sent as `null`. */
export function toUpdateBody(values: AnnouncementFormValues, now: Date = new Date()): UpdateAnnouncementBody {
  const body: UpdateAnnouncementBody = {
    title: values.title,
    body: values.body,
    isPinned: values.isPinned,
    teamId: values.teamId === "" ? null : values.teamId,
  };
  const publishedAt = publishedAtOf(values, now);
  if (publishedAt !== undefined) body.publishedAt = publishedAt;
  return body;
}
