/** Wire types of the promotions API. Keep in sync with the backend OpenAPI contract (docs/api/openapi.yaml in the SuiteASD-backend repository). */

export type CardTemplate = "ELETTRICO" | "MENTA" | "OCEANO" | "ALBA" | "NOTTE" | "CARBONE";

export type PromotionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** The roles of the people who work for the society that a promotion can be given to. */
export type AudienceRole = "ADMIN" | "SEGRETERIA" | "ALLENATORE" | "STAFF";

export interface Promotion {
  id: string;
  title: string;
  partnerName: string;
  partnerLabel: string | null;
  city: string | null;
  badge: string | null;
  terms: string | null;
  template: CardTemplate;
  /** Calendar day, "YYYY-MM-DD". */
  validFrom: string;
  /** Calendar day, "YYYY-MM-DD": the last day the card is valid. */
  validTo: string;
  status: PromotionStatus;
  publishedAt: string | null;
  allMembers: boolean;
  teamIds: string[];
  roles: AudienceRole[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionBody {
  title: string;
  partnerName: string;
  partnerLabel?: string;
  city?: string;
  badge?: string;
  terms?: string;
  template: CardTemplate;
  validFrom: string;
  validTo: string;
  allMembers: boolean;
  teamIds: string[];
  roles: AudienceRole[];
}

/** A partial update: an optional text is cleared with null. */
export interface UpdatePromotionBody {
  title?: string;
  partnerName?: string;
  partnerLabel?: string | null;
  city?: string | null;
  badge?: string | null;
  terms?: string | null;
  template?: CardTemplate;
  validFrom?: string;
  validTo?: string;
  allMembers?: boolean;
  teamIds?: string[];
  roles?: AudienceRole[];
}

export type CardState = "ACTIVE" | "UPCOMING";

/** A card as the person who holds it sees it. */
export interface PromotionCard {
  promotionId: string;
  title: string;
  partnerName: string;
  partnerLabel: string | null;
  city: string | null;
  badge: string | null;
  terms: string | null;
  template: CardTemplate;
  validFrom: string;
  validTo: string;
  state: CardState;
  societyName: string;
  holderName: string;
  holderMemberId: string | null;
  /** For a child, the guardian who acts for them. */
  representedBy: string | null;
  /** Whether the society has a logo to print on the card. */
  hasSocietyLogo: boolean;
}
