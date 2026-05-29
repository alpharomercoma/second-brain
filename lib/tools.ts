import { tool } from 'ai';
import { z } from 'zod';
import {
  listDocs,
  readDoc,
  readDocText,
  writeDoc,
  isTextDoc,
  normalizePath,
  type DocEntry,
} from './blob-docs';

/**
 * Agent tools, backed by Vercel Blob. This is the "file search via tool calling"
 * approach — NO embedder, reranker, or vector DB. `searchFiles` is a plain text
 * scan over the user's documents.
 *
 * Tools are built per-request so they can close over the currently-open document
 * path and share an in-request cache (so multiple agent steps don't re-fetch the
 * same documents).
 */

export type ToolContext = {
  /** Path of the document open in the editor; default write target. */
  openPath?: string;
};

const MAX_DOC_BYTES = 200_000;

export function buildTools(ctx: ToolContext) {
  // In-request cache: pathname -> { uploadedAt, text }. Avoids refetching
  // unchanged docs across search/read calls within one agent turn.
  const cache = new Map<string, { uploadedAt: string; text: string }>();

  async function fetchText(entry: DocEntry): Promise<string> {
    const hit = cache.get(entry.path);
    if (hit && hit.uploadedAt === entry.uploadedAt) return hit.text;
    const text = ((await readDocText(entry.path)) ?? '').slice(0, MAX_DOC_BYTES);
    cache.set(entry.path, { uploadedAt: entry.uploadedAt, text });
    return text;
  }

  const searchFiles = tool({
    description:
      "Search the user's documents (speakerships, achievements, project ideas, notes, etc.) " +
      'for passages relevant to a query. Returns the most relevant documents with matching ' +
      'snippets and their paths. Use focused, narrow queries; make separate calls for separate ' +
      'topics. This is the primary way to ground new ideas in the user\'s real history.',
    inputSchema: z.object({
      query: z.string().describe('A focused keyword phrase or question to search for.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(8)
        .describe('Maximum number of documents to return.'),
    }),
    execute: async ({ query, maxResults }) => {
      const docs = (await listDocs('')).filter((d) => isTextDoc(d.path));
      const terms = tokenize(query);
      const scored: { path: string; score: number; snippets: string[] }[] = [];

      for (const d of docs) {
        const text = await fetchText(d);
        if (!text) continue;
        const { score, snippets } = scoreDocument(text, terms, query);
        if (score > 0) scored.push({ path: d.path, score, snippets });
      }

      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, maxResults);
      return {
        query,
        matched: results.length,
        scanned: docs.length,
        results,
      };
    },
  });

  const readFile = tool({
    description:
      'Read the full text content of a single document by its path. Use after searchFiles to ' +
      'get complete context before writing or synthesizing ideas.',
    inputSchema: z.object({
      path: z.string().describe('The document path, e.g. "speakerships/2025-talks.md".'),
    }),
    execute: async ({ path }) => {
      const doc = await readDoc(path, MAX_DOC_BYTES);
      if (!doc) return { path: normalizePath(path), error: 'not_found' };
      return doc;
    },
  });

  const listFiles = tool({
    description:
      'List the user\'s documents and folders, optionally under a path prefix. Use to explore ' +
      'what data exists before searching.',
    inputSchema: z.object({
      prefix: z
        .string()
        .default('')
        .describe('Folder prefix to list under, e.g. "achievements/". Empty lists everything.'),
    }),
    execute: async ({ prefix }) => {
      const docs = await listDocs(prefix);
      return {
        prefix: normalizePath(prefix),
        files: docs.map((d) => ({ path: d.path, size: d.size, modified: d.uploadedAt })),
      };
    },
  });

  const writeDocument = tool({
    description:
      'Write content into a document — this is how you put generated ideas/text into the ' +
      "editor. If `path` is omitted it targets the currently-open document. Modes: " +
      "'replace' (overwrite whole doc), 'append' (add to the end), 'patch' (replace the first " +
      "occurrence of `find` with `replace`). Write finished prose, not narration about writing.",
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .describe('Target document path. Omit to write to the currently-open document.'),
      mode: z.enum(['replace', 'append', 'patch']).default('replace'),
      content: z
        .string()
        .optional()
        .describe('Text to write (for replace/append).'),
      find: z.string().optional().describe('Substring to locate (mode=patch).'),
      replace: z.string().optional().describe('Replacement text (mode=patch).'),
    }),
    execute: async ({ path, mode, content, find, replace }) => {
      const target = normalizePath(path || ctx.openPath || '');
      if (!target) return { error: 'no_target_path' };

      let next: string;
      if (mode === 'replace') {
        next = content ?? '';
      } else {
        const existing = (await readDoc(target, MAX_DOC_BYTES))?.content ?? '';
        if (mode === 'append') {
          next = existing + (existing && !existing.endsWith('\n') ? '\n' : '') + (content ?? '');
        } else {
          // patch
          if (!find) return { error: 'patch_requires_find' };
          if (!existing.includes(find)) return { error: 'find_not_found', find };
          next = existing.replace(find, replace ?? '');
        }
      }

      const result = await writeDoc(target, next);
      // The full new content is returned so the frontend can apply it to the
      // open editor live when it sees this tool result.
      return { ...result, mode, content: next };
    },
  });

  return { searchFiles, readFile, listFiles, writeDocument };
}

// --- scoring helpers (lightweight lexical search) ---

function tokenize(s: string): string[] {
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1),
    ),
  );
}

function scoreDocument(
  text: string,
  terms: string[],
  rawQuery: string,
): { score: number; snippets: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  const matchedTerms = new Set<string>();

  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      score += 1;
      matchedTerms.add(term);
      idx = lower.indexOf(term, idx + term.length);
    }
  }
  // Bonus for matching the exact phrase and for term coverage.
  if (rawQuery.length > 2 && lower.includes(rawQuery.toLowerCase())) score += 5;
  score += matchedTerms.size * 2; // reward breadth of distinct term hits

  const snippets = buildSnippets(text, lower, terms, 3);
  return { score, snippets };
}

function buildSnippets(text: string, lower: string, terms: string[], max: number): string[] {
  const snippets: string[] = [];
  const seen = new Set<number>();
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + term.length + 120);
    const key = Math.floor(start / 100);
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push((start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : ''));
    if (snippets.length >= max) break;
  }
  return snippets;
}
