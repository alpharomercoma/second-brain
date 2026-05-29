import { put, list, head, del, get } from '@vercel/blob';

/**
 * Document layer over Vercel Blob. Files and folders ARE the documents:
 * a "folder" is just a `/`-delimited prefix in the pathname. This replaces a
 * filesystem/DB — and there is NO vector store; search is plain text scan
 * (see lib/tools.ts).
 *
 * Works with BOTH public and private Blob stores (set BLOB_ACCESS). For a
 * private store, reads go through the authenticated `get()` API rather than a
 * public URL fetch — which is also more appropriate for personal documents.
 *
 * All document mutation funnels through here so we can enforce a path allowlist
 * (the BLOB_READ_WRITE_TOKEN is full read/write to the entire store).
 */

export type DocEntry = {
  path: string; // pathname, e.g. "speakerships/2025-aws-reinvent.md"
  url: string; // blob url (used for delete; not directly fetchable on private stores)
  size: number;
  uploadedAt: string; // ISO timestamp
};

const TEXT_EXT = /\.(md|markdown|txt|json|csv|yaml|yml|html?|rtf)$/i;

/** 'public' | 'private' — must match how the Blob store is configured. */
const ACCESS: 'public' | 'private' =
  process.env.BLOB_ACCESS === 'private' ? 'private' : 'public';

/** Comma-separated prefixes allowed for read/write. Empty => allow all. */
function allowlist(): string[] {
  return (process.env.DOC_PATH_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPathAllowed(path: string): boolean {
  const list = allowlist();
  if (list.length === 0) return true;
  return list.some((prefix) => path === prefix || path.startsWith(prefix));
}

function assertAllowed(path: string) {
  const clean = normalizePath(path);
  if (!isPathAllowed(clean)) {
    throw new Error(`Path not allowed by DOC_PATH_ALLOWLIST: ${clean}`);
  }
  return clean;
}

/** Strip leading slashes and collapse `..` so paths stay within the store. */
export function normalizePath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

export function isTextDoc(path: string): boolean {
  return TEXT_EXT.test(path);
}

/** List documents under a prefix (the file tree). */
export async function listDocs(prefix = ''): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ prefix: normalizePath(prefix), cursor, limit: 1000 });
    for (const b of res.blobs) {
      entries.push({
        path: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt:
          typeof b.uploadedAt === 'string' ? b.uploadedAt : b.uploadedAt.toISOString(),
      });
    }
    cursor = res.cursor;
  } while (cursor);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

/** Resolve a path to its current blob entry (for the url + metadata). */
export async function statDoc(path: string): Promise<DocEntry | null> {
  const clean = normalizePath(path);
  const res = await list({ prefix: clean, limit: 1000 });
  const match = res.blobs.find((b) => b.pathname === clean);
  if (!match) return null;
  return {
    path: match.pathname,
    url: match.url,
    size: match.size,
    uploadedAt:
      typeof match.uploadedAt === 'string'
        ? match.uploadedAt
        : match.uploadedAt.toISOString(),
  };
}

/**
 * Read a document's text content via the authenticated Blob API (works for
 * private stores). Returns null if it does not exist.
 */
export async function readDocText(path: string): Promise<string | null> {
  const clean = normalizePath(path);
  const res = await get(clean, { access: ACCESS });
  if (!res || !res.stream) return null;
  return await new Response(res.stream as ReadableStream).text();
}

/** Read a document for the editor/tools, size-capped. Null if missing. */
export async function readDoc(
  path: string,
  maxBytes = 200_000,
): Promise<{ path: string; content: string; truncated: boolean } | null> {
  const clean = assertAllowed(path);
  let content = await readDocText(clean);
  if (content === null) return null;
  let truncated = false;
  if (content.length > maxBytes) {
    content = content.slice(0, maxBytes);
    truncated = true;
  }
  return { path: clean, content, truncated };
}

/** Create or overwrite a document. */
export async function writeDoc(
  path: string,
  content: string,
): Promise<{ path: string; url: string; bytesWritten: number }> {
  const clean = assertAllowed(path);
  const blob = await put(clean, content, {
    access: ACCESS,
    contentType: contentTypeFor(clean),
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { path: clean, url: blob.url, bytesWritten: content.length };
}

/** Delete a document. */
export async function deleteDoc(path: string): Promise<{ path: string; deleted: boolean }> {
  const clean = assertAllowed(path);
  const entry = await statDoc(clean);
  if (!entry) return { path: clean, deleted: false };
  await del(entry.url);
  return { path: clean, deleted: true };
}

function contentTypeFor(path: string): string {
  if (/\.json$/i.test(path)) return 'application/json; charset=utf-8';
  if (/\.html?$/i.test(path)) return 'text/html; charset=utf-8';
  if (/\.(md|markdown)$/i.test(path)) return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

export { head };
