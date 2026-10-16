import { formatFileSize } from "./format";

/** Same rules as apps/api/src/modules/documents/storage.ts: every upload of the app (documents, attachments). */
export const ALLOWED_UPLOAD_TYPES: readonly string[] = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** Italian message when the file cannot be uploaded, or null when it is fine. */
export function validateUploadFile(file: File): string | null {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return "Il file deve essere un PDF, una foto JPG o una PNG.";
  if (file.size === 0) return "Il file è vuoto.";
  if (file.size > MAX_UPLOAD_BYTES)
    return `Il file pesa ${formatFileSize(file.size)}: il massimo è ${formatFileSize(MAX_UPLOAD_BYTES)}.`;
  return null;
}
