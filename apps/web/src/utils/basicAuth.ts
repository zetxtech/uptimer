export type BasicAuthCredentials = { username: string; password: string };

const BASIC_HEADER_PATTERN = /^Basic\s+(.+)$/i;

/** UTF-8 safe base64 of `username:password`, ready for an Authorization header. */
export function encodeBasicCredentials(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Splits an `Authorization: Basic …` value back into its credentials; null for other schemes. */
export function decodeBasicHeader(value: string): BasicAuthCredentials | null {
  const match = BASIC_HEADER_PATTERN.exec(value.trim());
  const encoded = match?.[1]?.trim();
  if (!encoded) return null;

  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const separator = decoded.indexOf(':');
    if (separator === -1) return { username: decoded, password: '' };
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}
