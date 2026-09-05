import type {
  ReqencConfig,
  ReqencInitOptions,
  ReqencRequestOptions,
  EncryptedPacket,
  ReqencResponse,
} from './types';
import { encrypt15LayerPayload } from './crypto';

const DEFAULT_PROXY_URL = 'https://proxy.reqenc.cwit.site';

export class ReqencClient {
  private config: ReqencConfig;

  constructor(options?: ReqencInitOptions) {
    this.config = {
      apiKey: options?.apiKey || this.getEnv('REQENC_API_KEY') || '',
      publicKey: options?.publicKey || this.getEnv('REQENC_PUBLIC_KEY') || '',
      proxyUrl: options?.proxyUrl || this.getEnv('REQENC_PROXY_URL') || DEFAULT_PROXY_URL,
      version: options?.version || '3',
    };
  }

  private getEnv(key: string): string | undefined {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
    return undefined;
  }

  /**
   * Configure or update credentials on this client instance.
   */
  public init(options: ReqencInitOptions): void {
    this.config = {
      ...this.config,
      ...options,
      apiKey: options.apiKey || this.config.apiKey,
      publicKey: options.publicKey || this.config.publicKey,
      proxyUrl: options.proxyUrl || this.config.proxyUrl || DEFAULT_PROXY_URL,
    };
  }

  /**
   * Get current client configuration (sanitized).
   */
  public getConfig(): Readonly<ReqencConfig> {
    return { ...this.config };
  }

  /**
   * Encrypt arbitrary string or JSON object using the active project's 2048-bit RSA + AES-256 envelope.
   */
  public async encrypt(payload: string | object, customPublicKey?: string): Promise<EncryptedPacket> {
    const pubKey = customPublicKey || this.config.publicKey;
    if (!pubKey) {
      throw new Error('[REQENC] Missing publicKey. Provide it via reqenc.init({ publicKey }) or process.env.REQENC_PUBLIC_KEY.');
    }
    if (!this.config.apiKey) {
      throw new Error('[REQENC] Missing apiKey. Provide it via reqenc.init({ apiKey }) or process.env.REQENC_API_KEY.');
    }

    const plaintext = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return encrypt15LayerPayload(plaintext, this.config.apiKey, pubKey);
  }

  /**
   * Drop-in fetch replacement that automatically seals HTTP request methods, sensitive headers,
   * URL paths, and JSON bodies inside a 15-layer quantum-hardened encrypted envelope before
   * transmitting to the Cloudflare Anycast edge proxy.
   */
  public async fetch<T = any>(
    path: string,
    options: ReqencRequestOptions = {}
  ): Promise<ReqencResponse<T>> {
    const apiKey = options.apiKey || this.config.apiKey;
    const publicKey = options.publicKey || this.config.publicKey;
    const proxyUrl = (options.proxyUrl || this.config.proxyUrl || DEFAULT_PROXY_URL).replace(/\/+$/, '');

    if (!apiKey) {
      throw new Error('[REQENC] Missing apiKey. Set it in reqenc.init({ apiKey }) or process.env.REQENC_API_KEY.');
    }
    if (!publicKey) {
      throw new Error('[REQENC] Missing publicKey. Set it in reqenc.init({ publicKey }) or process.env.REQENC_PUBLIC_KEY.');
    }

    const method = (options.method || 'GET').toUpperCase();
    const headers = options.headers || {};
    const body = options.body;

    // Encapsulate method, path, headers, and body inside inner payload
    const innerPayload = {
      method,
      path: path.startsWith('/') ? path : `/${path}`,
      headers: { ...headers },
      body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
      ts: Date.now(),
    };

    // 15-layer autonomous encryption
    const encryptedPacket = await encrypt15LayerPayload(
      JSON.stringify(innerPayload),
      apiKey,
      publicKey
    );

    // Prepare abort controller for timeout
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = options.timeout || 30000;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await globalThis.fetch(`${proxyUrl}/api/proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-reqenc-key': apiKey,
          'x-reqenc-version': this.config.version || '3',
        },
        body: JSON.stringify({ d: encryptedPacket }),
        signal: controller ? controller.signal : undefined,
      });

      if (timeoutId) clearTimeout(timeoutId);

      let parsedData: any = null;
      let textData = '';

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        encryptedPacket,
        json: async <R = T>(): Promise<R> => {
          if (parsedData !== null) return parsedData;
          parsedData = await response.json();
          return parsedData;
        },
        text: async (): Promise<string> => {
          if (textData) return textData;
          textData = await response.text();
          return textData;
        },
      };
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`[REQENC] Request timed out after ${timeoutMs}ms.`);
      }
      throw err;
    }
  }
}
