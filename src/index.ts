import { ReqencClient } from './client';
export * from './types';
export * from './crypto';
export { ReqencClient };

/**
 * Default global singleton client instance.
 * Automatically picks up `process.env.REQENC_API_KEY`, `process.env.REQENC_PUBLIC_KEY`,
 * and `process.env.REQENC_PROXY_URL` in Node.js / Next.js environments.
 */
export const reqenc = new ReqencClient();

/** Alias for ReqencClient for object-oriented instantiation */
export const Reqenc = ReqencClient;

export default reqenc;
