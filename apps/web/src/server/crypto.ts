import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for bank account numbers (CLAUDE.md
 * security rules): AES-256-GCM, stored as "v1:<iv>:<tag>:<ciphertext>"
 * (base64url). The key comes only from the environment.
 */
export function encryptAccountNumber(plain: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("BANK_ACCOUNT_ENCRYPTION_KEY must be 32 bytes (base64)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptAccountNumber(stored: string, keyBase64: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Display form: last four digits only. */
export function maskAccountNumber(plain: string): string {
  return `•••• ${plain.slice(-4)}`;
}
