# reqenc-shield 🛡️

> **Enterprise 15-Layer End-to-End Request Encryption Client for Zero-Trust Microservices & Edge Proxies.**

[![npm version](https://img.shields.io/npm/v/reqenc-shield.svg?color=3b82f6)](https://www.npmjs.com/package/reqenc-shield)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org)

`reqenc-shield` is the official client SDK for [REQENC](https://reqenc.cwit.site). It transforms standard HTTP requests into 15-layer quantum-hardened encrypted envelopes sealed with **2048-bit RSA-OAEP** and **AES-256-GCM** before sending them over the wire.

Even if an attacker intercepts network packets via Wi-Fi sniffing, rogue proxies, or Burp Suite MITM, they will only see opaque ciphertext. The URL path, query params, HTTP method, and JSON body are completely invisible until decrypted inside your Cloudflare Anycast edge boundary.

---

## ⚡ Quick Installation

```bash
npm install reqenc-shield
# or
pnpm add reqenc-shield
# or
yarn add reqenc-shield
# or
bun add reqenc-shield
```

---

## 🚀 3-Minute Quickstart

### 1. Configure Environment Variables

Add your REQENC project credentials to your `.env` or `.env.local` file:

```env
# Found in your REQENC Console (https://reqenc.cwit.site/#dashboard)
REQENC_API_KEY="rqe_live_your_api_key_here"
REQENC_PROXY_URL="https://proxy.reqenc.cwit.site"

# Your Project's 2048-bit Public Key (PEM)
REQENC_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
```

### 2. Make Encrypted Requests

`reqenc-shield` automatically picks up your environment variables:

```typescript
import { reqenc } from 'reqenc-shield';

async function sendPayment() {
  // Drop-in replacement for standard fetch
  const response = await reqenc.fetch('/api/v1/payments/charge', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer user_token_secret',
    },
    body: {
      account_id: 'acc_ent_9942',
      amount_cents: 4999,
      currency: 'USD',
    },
  });

  const data = await response.json();
  console.log('Payment processed safely:', data);
}
```

---

## 🛠️ Programmatic Initialization

If you prefer passing credentials in code rather than environment variables:

```typescript
import { reqenc } from 'reqenc-shield';

reqenc.init({
  apiKey: 'rqe_live_your_key',
  publicKey: '-----BEGIN PUBLIC KEY-----\n...',
  proxyUrl: 'https://proxy.reqenc.cwit.site', // optional, defaults to edge proxy
});

const res = await reqenc.fetch('/api/v1/orders', { method: 'GET' });
const orders = await res.json();
```

Or instantiate isolated clients for multi-tenant environments:

```typescript
import { Reqenc } from 'reqenc-shield';

const clientA = new Reqenc({ apiKey: 'key_tenant_a', publicKey: 'pem_a' });
const clientB = new Reqenc({ apiKey: 'key_tenant_b', publicKey: 'pem_b' });

await clientA.fetch('/api/tenant-resource');
```

---

## 🌐 Framework Integrations

### Next.js (App Router / Server Actions)

```typescript
// app/actions/billing.ts
'use server';

import { reqenc } from 'reqenc-shield';

export async function processInvoice(invoiceId: string) {
  const res = await reqenc.fetch(`/api/billing/invoices/${invoiceId}/pay`, {
    method: 'POST',
    body: { paidAt: new Date().toISOString() },
  });

  if (!res.ok) throw new Error('Invoice settlement failed');
  return res.json();
}
```

### Express.js Microservice Gateway

```typescript
import express from 'express';
import { reqenc } from 'reqenc-shield';

const app = express();
app.use(express.json());

app.post('/checkout', async (req, res) => {
  try {
    const upstream = await reqenc.fetch('/api/v1/checkout', {
      method: 'POST',
      body: req.body,
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Encrypted proxy dispatch failed', message: err.message });
  }
});
```

---

## 🔒 15 Autonomous Security Layers

Every packet sent through `reqenc.fetch()` is wrapped in 15 distinct layers:

| Layer | Mechanism | Protection |
|:---:|---|---|
| **L01** | **Ephemeral Session Key** | Fresh 256-bit symmetric key per HTTP dispatch |
| **L02** | **2048-Bit RSA-OAEP Envelope** | Asymmetric key-wrapping with SHA-256 MGF1 |
| **L03** | **128-Bit Cryptographic Nonce** | Random high-entropy initialization vector |
| **L04** | **Microsecond Chrono-Seal** | Edge replay window drops expired requests |
| **L05** | **AEAD Integrity Authentication** | HMAC-SHA256 authenticated verification |
| **L06** | **Request Trace UUID** | Edge trace ID prevents double-spending |
| **L07** | **Hardware Identity Lock** | Public key fingerprint binding |
| **L08** | **Payload Compression** | Stream compression removes plaintext patterns |
| **L09** | **HKDF Key Separation** | Salted dynamic derivation for HMAC keys |
| **L10** | **Protected Header Envelope** | Sensitive headers sealed inside ciphertext |
| **L11** | **HTTP Method Masking** | GET/PUT/DELETE unified as opaque POST |
| **L12** | **Route Concealment** | URL paths sealed inside payload |
| **L13** | **Size-Bucket Padding** | 32-256 byte padding defeats traffic analysis |
| **L14** | **Protocol Strict Versioning** | Blocks downgraded or mismatched packets |
| **L15** | **Double-Hash Integrity Chain** | Recursive SHA256(SHA256) hash verification |

---

## 📖 API Reference

### `reqenc.fetch(path, options)`

Executes an encrypted HTTP request through your Cloudflare Anycast edge proxy.

- **`path`** (`string`): The destination API route (e.g. `/api/v1/payments`).
- **`options`** (`ReqencRequestOptions`):
  - `method` (`string`, default: `'POST'`): HTTP Method.
  - `headers` (`Record<string, string>`): Custom headers sealed inside the ciphertext.
  - `body` (`any`): JSON payload object or string.
  - `apiKey` (`string`): Optional per-request API key override.
  - `publicKey` (`string`): Optional per-request PEM public key override.
  - `proxyUrl` (`string`): Optional per-request proxy endpoint override.
  - `timeout` (`number`, default: `30000`): Timeout in milliseconds.

**Returns:** `Promise<ReqencResponse>` with `.json()`, `.text()`, `.ok`, `.status`, `.headers`, and `.encryptedPacket`.

### `reqenc.encrypt(payload, customPublicKey?)`

Encrypts arbitrary text or an object into a standalone 15-layer `EncryptedPacket` without dispatching over the network. Useful for queue messages, database column encryption, or webhooks.

---

## 📄 License

MIT © [CoreWave IT](https://reqenc.cwit.site)
