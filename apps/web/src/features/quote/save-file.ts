import type { DownloadedFile } from "@/lib/api";

const REVOKE_DELAY_MS = 1000;

/** Hands a downloaded blob to the browser as a file save (the API needs the Bearer header, so a plain link cannot be used). */
export function saveFile(file: DownloadedFile, fallbackName: string): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename ?? fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start reading the blob after the click returns
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
