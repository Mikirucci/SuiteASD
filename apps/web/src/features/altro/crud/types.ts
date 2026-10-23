import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { z } from "zod";
import type { PillOption, SelectOption } from "@/components/ui";
import type { AttachmentEntityType } from "@/features/attachments/api";

export type FieldKind =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "select"
  | "integer"
  | "money"
  | "date"
  | "datetime"
  | "member"
  | "suggest";

export interface FieldDef {
  /** Key in the form values. */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  hint?: string;
  /** Options of a `select`. */
  options?: readonly SelectOption[];
  /** Shares a row with the next half-width field from the `sm` breakpoint up. */
  half?: boolean;
  /** `member` only: form value that remembers the name of the chosen member (shown while editing). */
  labelName?: string;
  /** `suggest` only: where the names to offer come from, `{ data: string[] }` at `path`. */
  suggestions?: { path: string; query?: Record<string, string> };
}

/** Every form field is text: the resource converts to and from API types in `initialValues` and `toBody`. */
export type FormValues = Record<string, string>;
export type FormMode = "create" | "update";

export interface ResourceCopy {
  /** Name of the list and heading of the empty state, e.g. "Palestre". */
  plural: string;
  loadingLabel: string;
  newLabel: string;
  createTitle: string;
  createDescription: string;
  createSubmit: string;
  editTitle: string;
  editDescription: string;
  createdToast: string;
  updatedToast: string;
  deletedToast: string;
  emptyTitle: string;
  emptyDescription: string;
  deleteDescription: string;
  /** Plural noun that starts the "N in tutto" line below the list. */
  countNoun: string;
  moreLabel: string;
}

export interface RowContent {
  title: string;
  /** Lines under the title, in order; empty ones are skipped. */
  lines: ReadonlyArray<string | null>;
  /** Status next to the title (a Chip or Badge: never colour alone). */
  status?: ReactNode;
  leading?: ReactNode;
  /** Right-aligned figure such as an amount. */
  figure?: ReactNode;
}

export interface ResourceFilter {
  /** Describes what is filtered, e.g. "Filtra per stato". */
  label: string;
  /** Query parameter of the list endpoint. */
  param: string;
  /** The first option is the "no filter" one and must have value "". */
  options: readonly PillOption[];
}

/**
 * Everything the generic CRUD screen needs to know about a resource. One config per endpoint
 * (`/venues`, `/trips`...): the list, the form dialog and the delete confirmation are shared.
 */
export interface ResourceConfig<T extends { id: string }> {
  /** Root of the query keys; writes invalidate it. */
  key: string;
  /** Collection path under /api/v1. */
  path: string;
  /** Permission that shows the create/edit/delete actions. */
  writePermission: string;
  icon: LucideIcon;
  copy: ResourceCopy;
  fields: readonly FieldDef[];
  schema: z.ZodType<FormValues, FormValues>;
  initialValues: (item: T | null) => FormValues;
  toBody: (values: FormValues, mode: FormMode) => Record<string, unknown>;
  /** Maps an API field name to the form field it belongs to when they differ (`amountCents` -> `amount`). */
  fieldAliases?: Record<string, string>;
  row: (item: T) => RowContent;
  /** Set when files can be attached to the records: each row then offers an "Allegati" action. */
  attachmentType?: AttachmentEntityType;
  /** Name of the item inside the delete confirmation and the row action labels. */
  nameOf: (item: T) => string;
  /** Rows whose actions are hidden because another module owns them. */
  isReadOnly?: (item: T) => boolean;
  /** Text search sent as `q`. */
  searchLabel?: string;
  filter?: ResourceFilter;
}
