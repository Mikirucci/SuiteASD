import { formatFileSize } from "./document-format";

/** Same rules as apps/api/src/modules/documents/storage.ts. */
export const ALLOWED_DOCUMENT_TYPES: readonly string[] = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** Italian message when the file cannot be uploaded, or null when it is fine. */
export function validateDocumentFile(file: File): string | null {
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) return "Il file deve essere un PDF, una foto JPG o una PNG.";
  if (file.size === 0) return "Il file è vuoto.";
  if (file.size > MAX_DOCUMENT_BYTES)
    return `Il file pesa ${formatFileSize(file.size)}: il massimo è ${formatFileSize(MAX_DOCUMENT_BYTES)}.`;
  return null;
}
