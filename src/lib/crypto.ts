/**
 * API Key 存储工具
 *
 * 使用 Base64 编码存储
 * 注意：sessionStorage 本身在标签页关闭后会清除
 */

const STORAGE_KEY = "e-ppt-api-key";

/**
 * 编码 API Key (Base64)
 */
export async function encryptApiKey(apiKey: string, _secret?: string): Promise<string> {
  console.log("[crypto] encryptApiKey called with:", apiKey.slice(0, 10) + "...");
  // 使用 Base64 编码
  if (typeof window !== "undefined") {
    const encrypted = btoa(unescape(encodeURIComponent(apiKey)));
    console.log("[crypto] Encrypted result:", encrypted.slice(0, 20) + "...");
    return encrypted;
  }
  const encrypted = Buffer.from(apiKey, "utf-8").toString("base64");
  console.log("[crypto] Encrypted result (Node):", encrypted.slice(0, 20) + "...");
  return encrypted;
}

/**
 * 解码 API Key
 */
export async function decryptApiKey(encrypted: string, _secret?: string): Promise<string> {
  if (typeof window !== "undefined") {
    return decodeURIComponent(escape(atob(encrypted)));
  }
  return Buffer.from(encrypted, "base64").toString("utf-8");
}

/**
 * 存储编码后的 API Key 到 sessionStorage
 */
export function storeEncryptedKey(encrypted: string): void {
  if (typeof window !== "undefined") {
    console.log("[crypto] Storing API Key to sessionStorage:", encrypted.slice(0, 20) + "...");
    sessionStorage.setItem(STORAGE_KEY, encrypted);
    // 验证存储
    const stored = sessionStorage.getItem(STORAGE_KEY);
    console.log("[crypto] Verified API Key in sessionStorage:", stored?.slice(0, 20) + "...");
  }
}

/**
 * 从 sessionStorage 获取编码后的 API Key
 */
export function getStoredEncryptedKey(): string | null {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem(STORAGE_KEY);
  }
  return null;
}

/**
 * 清除存储的 API Key
 */
export function clearStoredKey(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
