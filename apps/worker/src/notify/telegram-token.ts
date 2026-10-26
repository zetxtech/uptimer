const TELEGRAM_TOKEN_CIPHER_PREFIX = 'v1';
const TELEGRAM_TOKEN_KEY_CONTEXT = 'uptimer.telegram.bot-token.v1';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveTelegramTokenKey(adminToken: string): Promise<CryptoKey> {
  const token = adminToken.trim();
  if (!token) {
    throw new Error('ADMIN_TOKEN is required for Telegram bot token encryption');
  }

  const enc = new TextEncoder();
  const material = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(`${TELEGRAM_TOKEN_KEY_CONTEXT}:${token}`),
  );
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptTelegramBotToken(
  adminToken: string,
  botToken: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveTelegramTokenKey(adminToken);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(botToken),
  );

  return `${TELEGRAM_TOKEN_CIPHER_PREFIX}:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptTelegramBotToken(
  adminToken: string,
  encryptedBotToken: string,
): Promise<string> {
  const [version, ivBase64, ciphertextBase64] = encryptedBotToken.split(':');
  if (version !== TELEGRAM_TOKEN_CIPHER_PREFIX || !ivBase64 || !ciphertextBase64) {
    throw new Error('Invalid Telegram bot token ciphertext');
  }

  const key = await deriveTelegramTokenKey(adminToken);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivBase64) },
    key,
    fromBase64(ciphertextBase64),
  );

  return new TextDecoder().decode(plaintext);
}
