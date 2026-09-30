import crypto from 'node:crypto';
import { logger } from '../utils/logger.ts';

// Photo hosting on Cloudinary, used when CLOUDINARY_URL is set
// (cloudinary://<api_key>:<api_secret>@<cloud_name>, from the Cloudinary dashboard).
// Uploads are signed here on the server, so the secret never reaches the browser.
// Without it, photos are stored in Postgres (tests, or when it is unset).

const FOLDER = 'college-adda/feed';

interface Config {
  cloud: string;
  key: string;
  secret: string;
}

/** Read on each call (not at boot) so tests can switch it on and off. */
function config(): Config | null {
  const raw = process.env.CLOUDINARY_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'cloudinary:' || !u.username || !u.password || !u.hostname) throw new Error('bad format');
    return { cloud: u.hostname, key: decodeURIComponent(u.username), secret: decodeURIComponent(u.password) };
  } catch {
    logger.error('CLOUDINARY_URL is set but malformed; expected cloudinary://<key>:<secret>@<cloud>');
    return null;
  }
}

/** Cloudinary's signature: SHA-1 of the sorted params joined with & plus the secret. */
function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(base + secret).digest('hex');
}

async function call(cfg: Config, action: 'upload' | 'destroy', params: Record<string, string>, file?: Blob) {
  const signed = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  for (const [k, v] of Object.entries(signed)) form.set(k, v);
  form.set('api_key', cfg.key);
  form.set('signature', sign(signed, cfg.secret));
  if (file) form.set('file', file);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/image/${action}`, { method: 'POST', body: form });
  const json = (await res.json().catch(() => ({}))) as { secure_url?: string; public_id?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Cloudinary ${action} failed (${res.status})`);
  return json;
}

export const cloudinary = {
  enabled: () => config() !== null,

  /** Uploads already-validated image bytes; returns the public HTTPS URL and the id needed to delete it. */
  async upload(data: Uint8Array, mime: string): Promise<{ url: string; publicId: string }> {
    const cfg = config();
    if (!cfg) throw new Error('Cloudinary is not configured');
    const out = await call(cfg, 'upload', { folder: FOLDER }, new Blob([new Uint8Array(data)], { type: mime }));
    if (!out.secure_url || !out.public_id) throw new Error('Cloudinary upload returned no URL');
    return { url: out.secure_url, publicId: out.public_id };
  },

  /** Best effort: a failed delete only leaves an orphaned image behind. */
  async destroy(publicId: string): Promise<void> {
    const cfg = config();
    if (!cfg) return;
    await call(cfg, 'destroy', { public_id: publicId }).catch((err) => logger.error('cloudinary delete failed', { err: String(err) }));
  },
};
