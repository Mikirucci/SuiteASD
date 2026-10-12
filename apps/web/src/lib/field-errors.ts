import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api/errors";

/**
 * Copies the field errors of an API problem onto the matching form fields.
 * `resolve` turns an API path ("setScores.1") into a form field name, or null when the form has no such field.
 * The server speaks English, so the field shows a neutral Italian message. Returns true if any field was marked.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  resolve: (apiPath: string) => Path<T> | null,
  message = "Valore non valido",
): boolean {
  if (!(error instanceof ApiError)) return false;
  let marked = false;
  for (const fieldError of error.fieldErrors) {
    const field = resolve(fieldError.path);
    if (field) {
      setError(field, { message });
      marked = true;
    }
  }
  return marked;
}
