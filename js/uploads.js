/**
 * /js/uploads.js -- image picker → client-side resize → Supabase Storage.
 *
 *   No "Choose Files" wildcard. Tight `accept` per CANON.
 *   Client-side downscale + JPEG re-encode keeps payloads small and
 *   strips EXIF (privacy: no GPS data leaving the device).
 *
 *   Upload path: <bucket>/<user_id>/<timestamp>.jpg
 *   This matches the RLS policy: (storage.foldername(name))[1] = auth.uid()
 *
 *   Returns the public URL on success.
 */

// @ts-check

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

/** Tight MIME whitelist -- no wildcards, no Files.app trapdoor. */
const ACCEPT_MIME = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';

/** Max payload before client-side resize is forced. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Open the native picker and return one image File.
 * Resolves with null if the user cancels.
 *
 * @returns {Promise<File|null>}
 */
export function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_MIME;
    // No `multiple`, no `capture` -- give the user the calmest sheet iOS allows.
    input.style.position = 'fixed';
    input.style.top = '-1000px';
    input.style.opacity = '0';
    input.setAttribute('aria-hidden', 'true');

    let settled = false;
    const settle = (/** @type {File|null} */ file) => {
      if (settled) return;
      settled = true;
      try { document.body.removeChild(input); } catch { /* already gone */ }
      window.removeEventListener('focus', focusFallback);
      resolve(file);
    };

    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      settle(f || null);
    });

    // iOS Safari sometimes never fires `change` on cancel -- focus return = cancel.
    const focusFallback = () => {
      setTimeout(() => {
        if (!settled && (!input.files || !input.files.length)) settle(null);
      }, 700);
    };
    window.addEventListener('focus', focusFallback);

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Validate the picked file: type, size.
 *
 * @param {File} file
 * @returns {string|null} Error message or null if OK.
 */
export function validateImage(file) {
  const allowed = ACCEPT_MIME.split(',');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const extOk = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext);
  const typeOk = file.type && allowed.includes(file.type);
  if (!typeOk && !extOk) {
    return 'Please pick a JPEG, PNG, WebP, or HEIC image.';
  }
  if (file.size > MAX_BYTES) {
    return 'That image is over 10 MB. Try a smaller one.';
  }
  return null;
}

/**
 * Resize an image File to a max dimension, re-encode as JPEG, strip EXIF.
 *
 * @param {File} file
 * @param {number} maxDim   -- max width or height in CSS pixels
 * @param {number} quality  -- JPEG quality 0.0–1.0
 * @returns {Promise<Blob>}
 */
export async function resizeToJpeg(file, maxDim = 800, quality = 0.86) {
  // Try createImageBitmap first (fast, handles EXIF orientation).
  /** @type {ImageBitmap|null} */
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback: load via <img>
  }

  let width;
  let height;
  /** @type {HTMLImageElement|null} */
  let imgEl = null;

  if (bitmap) {
    width = bitmap.width;
    height = bitmap.height;
  } else {
    imgEl = await loadImg(file);
    width = imgEl.naturalWidth;
    height = imgEl.naturalHeight;
  }

  if (!width || !height) throw new Error('Image has no dimensions.');

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // High-quality downscale
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();
  } else if (imgEl) {
    ctx.drawImage(imgEl, 0, 0, targetW, targetH);
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Re-encode failed.'));
    }, 'image/jpeg', quality);
  });
}

/**
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

/**
 * Upload a Blob to a Supabase Storage bucket at <userId>/<filename>.
 * RLS requires the first path segment == auth.uid().
 *
 * @param {object} args
 * @param {string} args.bucket
 * @param {string} args.userId
 * @param {Blob}   args.blob
 * @param {string} args.accessToken
 * @param {string} [args.contentType]
 * @param {string} [args.filename]  -- stable name; defaults to 'avatar.jpg'
 * @returns {Promise<string>} The public URL of the uploaded object.
 *
 * Uses a stable filename + x-upsert so each user owns a single object
 * per bucket. Older revisions are overwritten, not orphaned. Cache-
 * busting is the caller's job (append ?v=<ts> to the returned URL).
 */
export async function uploadToBucket({ bucket, userId, blob, accessToken, contentType = 'image/jpeg', filename = 'avatar.jpg' }) {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* not JSON */ }
    throw new Error(detail || `Upload failed (${res.status}).`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}`;
}


/**
 * Delete an object from a bucket. RLS scopes by first path segment.
 * Silently 404 is treated as success (object already gone is fine).
 *
 * @param {object} args
 * @param {string} args.bucket
 * @param {string} args.userId
 * @param {string} args.accessToken
 * @param {string} [args.filename]
 * @returns {Promise<void>}
 */
export async function deleteFromBucket({ bucket, userId, accessToken, filename = 'avatar.jpg' }) {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* not JSON */ }
    throw new Error(detail || `Delete failed (${res.status}).`);
  }
}
