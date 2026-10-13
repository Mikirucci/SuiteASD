"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input, Select } from "@/components/ui";
import { useCursorQuery } from "@/features/quote/use-cursor-query";
import { useDebouncedValue } from "@/features/quote/use-debounced-value";
import type { FieldDef, FormValues } from "./types";

interface MemberRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MemberFieldProps {
  field: FieldDef;
  form: UseFormReturn<FormValues>;
  error?: string;
}

/** Pick a member by searching their name: the roster can be far larger than any select could list. */
export function MemberField({ field, form, error }: MemberFieldProps) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());
  const members = useCursorQuery<MemberRef>(["altro-members", { q }], "/members", { q: q || undefined, limit: 25 });

  const labelName = field.labelName ?? `${field.name}Label`;
  const selectedId = form.watch(field.name);
  const selectedLabel = form.watch(labelName);

  const found = (members.items ?? []).map((member) => ({ value: member.id, label: `${member.firstName} ${member.lastName}` }));
  const options = [
    { value: "", label: "Nessuno" },
    ...(selectedId !== "" && !found.some((option) => option.value === selectedId) ? [{ value: selectedId, label: selectedLabel }] : []),
    ...found,
  ];

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Cerca un tesserato"
        leadingIcon={<Search />}
        type="search"
        autoComplete="off"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Select
        label={field.label}
        hint={members.error ? "Non siamo riusciti a cercare i tesserati: riprova a scrivere il nome." : field.hint}
        error={error}
        options={options}
        value={selectedId}
        onChange={(event) => {
          const id = event.target.value;
          form.setValue(field.name, id, { shouldDirty: true });
          form.setValue(labelName, options.find((option) => option.value === id)?.label ?? "", { shouldDirty: true });
        }}
      />
    </div>
  );
}
