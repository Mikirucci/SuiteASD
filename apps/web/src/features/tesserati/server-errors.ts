import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";
import { ApiError, describeError } from "@/lib/api";

/** API paths look like "firstName" or "body.firstName": keep the last segment when it is a field of the form. */
function fieldOf(apiPath: string, fields: readonly string[]): string | null {
  const field = apiPath.split(".").pop() ?? "";
  return fields.includes(field) ? field : null;
}

/**
 * Shows server-side validation on the matching fields and returns the message for the form-level alert (null when a field already says it).
 * `codeFields` maps a problem code (e.g. "fiscal_code_taken") to the field and the Italian message to show on it.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
  codeFields: Record<string, { field: string; message: string }> = {},
): string | null {
  if (error instanceof ApiError) {
    const byCode = error.code ? codeFields[error.code] : undefined;
    if (byCode) {
      setError(byCode.field as FieldPath<T>, { message: byCode.message });
      return null;
    }
    for (const fieldError of error.fieldErrors) {
      const field = fieldOf(fieldError.path, fields);
      if (field) setError(field as FieldPath<T>, { message: "Valore non valido" });
    }
  }
  return describeError(error);
}
