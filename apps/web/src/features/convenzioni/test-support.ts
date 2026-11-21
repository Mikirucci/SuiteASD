import type { Promotion, PromotionCard } from "./types";

export const PROMOTION: Promotion = {
  id: "p-fisio",
  title: "Fisioterapia scontata",
  partnerName: "Therapia",
  partnerLabel: "Medical partner",
  city: "Bitonto",
  badge: "Sconti",
  terms: "10% su ogni seduta",
  template: "OCEANO",
  validFrom: "2026-09-01",
  validTo: "2027-05-31",
  status: "PUBLISHED",
  publishedAt: "2026-09-02T08:00:00.000Z",
  allMembers: false,
  teamIds: ["t16"],
  roles: ["ALLENATORE"],
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z",
};

export const DRAFT: Promotion = {
  ...PROMOTION,
  id: "p-bozza",
  title: "Palestra convenzionata",
  partnerName: "Fit Club",
  status: "DRAFT",
  publishedAt: null,
  allMembers: true,
  teamIds: [],
  roles: [],
};

export const ARCHIVED: Promotion = { ...PROMOTION, id: "p-vecchia", title: "Vecchia convenzione", status: "ARCHIVED" };

export const CARD: PromotionCard = {
  promotionId: "p-fisio",
  title: "Fisioterapia scontata",
  partnerName: "Therapia",
  partnerLabel: "Medical partner",
  city: "Bitonto",
  badge: "Sconti",
  terms: "10% su ogni seduta",
  template: "OCEANO",
  validFrom: "2026-09-01",
  validTo: "2027-05-31",
  state: "ACTIVE",
  societyName: "ASD Amavolley Bitonto",
  holderName: "Marco Loiodice",
  holderMemberId: "m-marco",
  representedBy: null,
};
