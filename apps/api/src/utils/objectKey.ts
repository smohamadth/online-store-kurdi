// ---------------------------------------------------------------------------
// Safe object-key components for uploaded files.
//
// storage.routes.ts builds a MinIO key as `${folder}/${userId}/${uuid}.${ext}`.
// The `folder` component is allowlisted there because "an unvalidated folder
// would let any caller write into arbitrary prefixes". The extension needs the
// same treatment for the same reason - it used to be
// `file.originalname.split('.').pop()`, i.e. attacker-controlled:
//
//   "x.jpg/../../../../etc/passwd"  -> "/etc/passwd"   (escapes the prefix)
//   "noext"                         -> "noext"         (the whole filename)
//   "a." + "A".repeat(200)          -> a 200-char extension
//
// Lives in utils/ rather than in the route module so it can be unit-tested
// without importing the Prisma-backed router.
// ---------------------------------------------------------------------------

/** Allowed upload mime types -> the extension we store them under. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/zip': 'zip',
};

/**
 * Pick the file extension for a stored object.
 *
 * Prefers the validated mime type (multer's fileFilter has already checked
 * it). Only when the type is unrecognised does it look at the client-supplied
 * name, and then only accepts a short plain-alphanumeric token; anything with
 * a separator, a dot-segment, an escape or excess length becomes "bin".
 *
 * The return value is always safe to interpolate into an object key.
 */
export function safeExtension(mimetype: string, originalName: string): string {
  const fromMime = MIME_EXTENSIONS[(mimetype || '').trim().toLowerCase()];
  if (fromMime) return fromMime;

  const name = originalName || '';
  // No dot means no extension - the old code returned the entire filename.
  if (!name.includes('.')) return 'bin';

  const raw = name.split('.').pop() ?? '';
  return /^[a-z0-9]{1,8}$/i.test(raw) ? raw.toLowerCase() : 'bin';
}
