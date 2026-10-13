/** Wire types of the announcements API. Source of truth: apps/api/src/modules/announcements/schema.ts. */

export type AnnouncementStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  teamId: string | null;
  teamName: string | null;
  isPinned: boolean;
  publishedAt: string | null;
  status: AnnouncementStatus;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST /announcements (omitted `publishedAt`: published now; null: draft; future instant: scheduled). */
export interface CreateAnnouncementBody {
  title: string;
  body: string;
  teamId?: string;
  isPinned: boolean;
  publishedAt?: string | null;
}

/** Body of PATCH /announcements/:id: every field optional, `null` clears the team or unpublishes. */
export interface UpdateAnnouncementBody {
  title?: string;
  body?: string;
  teamId?: string | null;
  isPinned?: boolean;
  publishedAt?: string | null;
}

/** Subset of the team resource used for the audience. */
export interface TeamOption {
  id: string;
  name: string;
}
