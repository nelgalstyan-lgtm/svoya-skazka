// Байты и base64 без лишней работы процессора (на бесплатном тарифе Cloudflare — 10 мс на запуск).
// В Worker'е есть встроенные Uint8Array.fromBase64/toBase64; в Node (тесты) — Buffer.

export function fromBase64(s) {
  return Uint8Array.fromBase64 ? Uint8Array.fromBase64(s) : new Uint8Array(Buffer.from(s, 'base64'));
}

export function toBase64(bytes) {
  return bytes.toBase64 ? bytes.toBase64() : Buffer.from(bytes).toString('base64');
}

function indexOf(bytes, needle, from = 0) {
  for (let i = bytes.indexOf(needle[0], from); i >= 0; i = bytes.indexOf(needle[0], i + 1)) {
    let j = 1;
    while (j < needle.length && bytes[i + j] === needle[j]) j += 1;
    if (j === needle.length) return i;
  }
  return -1;
}

/**
 * Строковое поле key из JSON-ответа — без JSON.parse всего ответа: в нём мегабайт base64,
 * и разбор целиком стоит больше, чем весь бесплатный лимит процессора.
 */
export function jsonStringField(bytes, key) {
  const marker = new TextEncoder().encode(`"${key}"`);
  let i = indexOf(bytes, marker);
  if (i < 0) return null;
  i += marker.length;
  while (i < bytes.length && bytes[i] !== 0x22) {
    if (bytes[i] !== 0x3a && bytes[i] > 0x20) return null; // после ключа — только двоеточие и пробелы
    i += 1;
  }
  const end = bytes.indexOf(0x22, i + 1);
  if (end < 0) return null;
  const value = new TextDecoder().decode(bytes.subarray(i + 1, end));
  return value.includes('\\') ? value.replace(/\\\//g, '/') : value;
}
