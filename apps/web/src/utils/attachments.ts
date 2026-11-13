/** Converts a picked file into the base64 payload accepted by the update endpoints. */
export async function fileToAttachment(file: File): Promise<{ name: string; data: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { name: file.name, data: btoa(binary) };
}

export const ATTACHMENT_MAX_FILES = 3;
export const ATTACHMENT_MAX_BYTES = 200 * 1024;

export function attachmentSelectionError(files: File[]): boolean {
  return (
    files.length > ATTACHMENT_MAX_FILES ||
    files.some((file) => file.size > ATTACHMENT_MAX_BYTES || file.name.length > 200)
  );
}
