"use client";

import { useState, type ReactNode } from "react";
import { PillFilter } from "@/components/ui";
import type { Subject } from "./subjects";

/**
 * Who a page is about when the user looks after more than one person (a parent with two children, an athlete who is
 * also a parent). With a single person there is nothing to choose: `picker` is null.
 */
export function useSubjectChoice(subjects: readonly Subject[]): { subject: Subject | null; picker: ReactNode } {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const subject = subjects.find((candidate) => candidate.memberId === chosenId) ?? subjects[0] ?? null;
  const picker =
    subjects.length > 1 && subject ? (
      <PillFilter
        label="Per chi"
        options={subjects.map((candidate) => ({ value: candidate.memberId, label: candidate.name }))}
        value={subject.memberId}
        onChange={setChosenId}
      />
    ) : null;
  return { subject, picker };
}
