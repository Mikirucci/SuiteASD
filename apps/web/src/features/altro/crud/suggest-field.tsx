"use client";

import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import type { FieldDef, FormValues } from "./types";

export interface SuggestFieldProps {
  field: FieldDef;
  form: UseFormReturn<FormValues>;
  error?: string;
}

/**
 * A free text that offers what the club already uses (the categories of the balance): picking one avoids a second
 * spelling of the same name, and a new name can still be typed. The list is a hint only: the form works without it.
 */
export function SuggestField({ field, form, error }: SuggestFieldProps) {
  const listId = useId();
  const source = field.suggestions;
  const suggestions = useApiQuery<{ data: string[] }>(["suggestions", source?.path, source?.query], source?.path ?? "", {
    query: source?.query,
    enabled: source !== undefined,
  });
  return (
    <>
      <Input
        label={field.label}
        required={field.required}
        hint={field.hint}
        error={error}
        list={listId}
        autoComplete="off"
        {...form.register(field.name)}
      />
      <datalist id={listId}>
        {(suggestions.data?.data ?? []).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
