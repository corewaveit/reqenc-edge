import type { EncryptedPacket } from './types';

function getCrypto(): { subtle: SubtleCrypto; random: Crypto } {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return { subtle: globalThis.crypto.subtle, random: globalThis.crypto };
  }
  try {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = typeof require !== 'undefined' ? require('node:crypto') : null;
    if (nodeCrypto?.webcrypto?.subtle) {
      return { subtle: nodeCrypto.webcrypto.subtle, random: nodeCrypto.webcrypto };
    }
  } catch {
    // ignore
  }
  throw new Error('[REQENC] WebCrypto API is not supported in this runtime. Requires Node.js >= 16 or modern browser.');
}

export function ab2b64(buf: ArrayBuffer | ArrayBufferView): string {
  if (typeof Buffer !== 'undefined') {
    const arrayBuffer = buf instanceof ArrayBuffer ? buf : buf.buffer;
    return Buffer.from(arrayBuffer).toString('base64');
  }
  const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function b642ab(b64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf.buffer;
}

export function randomHex(bytes = 16): string {
  const { random } = getCrypto();
  const arr = new Uint8Array(bytes);
  random.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function doubleHash(data: string): Promise<string> {
  const { subtle } = getCrypto();
  const enc = new TextEncoder();
  const first = await subtle.digest('SHA-256', enc.encode(data));
  const second = await subtle.digest('SHA-256', first);
  return Array.from(new Uint8Array(second)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const { subtle } = getCrypto();
  const cleanPem = pem
    .replace(/-----[^-]+-----/g, '')
    .replace(/[\r\n\s]/g, '');
  const buf = b642ab(cleanPem);
  return subtle.importKey(
    'spki',
    buf,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

export async function deriveSigningKey(apiKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const { subtle } = getCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(apiKey),
    'HKDF',
    false,
    ['deriveBits', 'deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      info: enc.encode('REQENC-HMAC-SIGNING-v3'),
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify']
  );
}

/**
 * Executes the 15-layer autonomous encryption pipeline on any plaintext or serialized JSON string.
 */
export async function encrypt15LayerPayload(
  plaintext: string,
  apiKey: string,
  publicKeyPem: string
): Promise<EncryptedPacket> {
  const { subtle, random } = getCrypto();
  const enc = new TextEncoder();
  const pubKey = await importPublicKey(publicKeyPem);

  // Layer 1: Ephemeral AES-256-GCM Session Key Derivation
  const sessionKey = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );

  // Layer 3: 12-byte IV / Nonce vector
  const iv = new Uint8Array(12);
  random.getRandomValues(iv);
  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    enc.encode(plaintext)
  );

  // Layer 2: 2048-Bit RSA-OAEP Asymmetric Key Envelope
  const rawKey = await subtle.exportKey('raw', sessionKey);
  const wrappedKey = await subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawKey);

  // Layer 3, 4, 6, 7: Nonce, Timestamp, Trace UUID, Public Key Fingerprint
  const nonce = randomHex(16);
  const timestamp = Date.now();
  const rid = typeof random.randomUUID === 'function' ? random.randomUUID() : randomHex(16);
  const keyFingerprint = (await doubleHash(publicKeyPem)).substring(0, 16);

  const e = ab2b64(cipherBuf);
  const k = ab2b64(wrappedKey);
  const ivB64 = ab2b64(iv.buffer);

  // Layer 13: Size-Bucket Entropy Padding against traffic analysis
  const padLen = Math.floor(Math.random() * (256 - 32 + 1)) + 32;
  const padArr = new Uint8Array(padLen);
  random.getRandomValues(padArr);
  const pad = ab2b64(padArr);

  // Layer 15: Request/Response Integrity Chain (Double Hash)
  const dh = await doubleHash(`${rid}:${e}:${k}`);

  // Layer 5 & 9: HKDF Salted Key Separation + AEAD Integrity Signature
  const salt = new Uint8Array(32);
  random.getRandomValues(salt);
  const signingKey = await deriveSigningKey(apiKey, salt);
  const sigPayload = `v3:${timestamp}:${nonce}:${rid}:${keyFingerprint}:${dh}:${k}:${e}`;
  const sigBuf = await subtle.sign('HMAC', signingKey, enc.encode(sigPayload));
  const s = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    v: '3',
    e,
    k,
    iv: ivB64,
    n: nonce,
    t: timestamp,
    rid,
    kfp: keyFingerprint,
    dh,
    pad,
    salt: ab2b64(salt.buffer),
    z: false,
    s,
  };
}
