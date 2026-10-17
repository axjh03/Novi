import crypto from "crypto";

// Retired /api/v1 only: refuse to hash, encrypt or decrypt without real secrets.
function serverSecret() {
  const value = process.env.LICENSE_SERVER_SECRET;
  if (!value || value.length < 32) throw new Error("Configure LICENSE_SERVER_SECRET with at least 32 random characters.");
  return value;
}
function masterKey() {
  const value = process.env.ENCRYPTION_MASTER_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Configure ENCRYPTION_MASTER_KEY with 32 random bytes in hex.");
  return Buffer.from(value, "hex");
}

/**
 * Generate high-entropy license key format: NVI-XXXX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "NVI";
  for (let i = 0; i < 4; i++) {
    key += "-";
    for (let j = 0; j < 4; j++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      key += chars[randomIndex];
    }
  }
  return key;
}

/**
 * HMAC-SHA256 Hash of plaintext license key for safe DB storage
 */
export function hashLicenseKey(licenseKey: string): string {
  const cleanKey = licenseKey.trim().toUpperCase();
  return crypto.createHmac("sha256", serverSecret()).update(cleanKey).digest("hex");
}

/**
 * Mask license key for UI display (e.g. NVI-7K4M-****-****-DM73)
 */
export function maskLicenseKey(licenseKey: string): string {
  const parts = licenseKey.trim().split("-");
  if (parts.length === 5) {
    return `${parts[0]}-${parts[1]}-****-****-${parts[4]}`;
  }
  return `${licenseKey.slice(0, 8)}****${licenseKey.slice(-4)}`;
}

/**
 * AES-256-GCM Encryption for API Credentials
 */
export function encryptSecret(plaintext: string): string {
  const key = masterKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  // Format: iv:authTag:encryptedHex
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM Decryption for API Credentials
 */
export function decryptSecret(encryptedBlob: string): string {
  const key = masterKey();
  try {
    const parts = encryptedBlob.split(":");
    if (parts.length !== 3) return "[Decryption Error]";
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Decryption Error]";
  }
}

/**
 * Generate unique device activation token
 */
export function generateDeviceToken(): string {
  return "devtok_" + crypto.randomBytes(24).toString("hex");
}
