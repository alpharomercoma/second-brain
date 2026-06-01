# qwen3-agentic-rag-fe

Next.js (App Router) app + agent brain for the idea assistant. A single repo, deploys on Vercel.

A Google-Docs-style editor whose file system is a VS-Code-like tree of documents (stored in **Vercel Blob**). A wide AI bar at the bottom runs an **agentic loop** (Vercel AI SDK) on the **Mistral AI API**, searches your prior work via tool calling (no vector DB), and writes generated ideas straight into the open document.

```
Browser (useChat)
  └─ POST /api/chat ──► streamText(ideaModel, tools, stopWhen)
                          │   tools run here, over Vercel Blob:
                          │     searchFiles · readFile · listFiles · writeDocument
                          └─ @ai-sdk/mistral ──► Mistral API (mistral-large-latest)
  └─ /api/files[...] ──► Vercel Blob CRUD
```

## Architecture

- **`lib/mistral.ts`** — AI SDK provider (`@ai-sdk/mistral`) for the hosted Mistral API. Model is set via `MISTRAL_MODEL`.
- **`lib/blob-docs.ts`** — document CRUD over `@vercel/blob` (+ path allowlist; the token is full-store RW).
- **`lib/tools.ts`** — the agent tools (lexical file search + read/list/write). **No embeddings/reranker.**
- **`lib/prompt.ts`** — idea-generation system prompt; tells the agent to discover/read docs via tools and cite paths.
- **`app/api/chat/route.ts`** — the agent loop; streams reasoning + tool steps + text (transparency).
- **`app/api/files/...`** — plain document CRUD.
- **`app/page.tsx` + `components/`** — file tree, editor, AI bar.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

### Env (`.env.local`)

| Variable | Purpose |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token (server-side only) |
| `BLOB_ACCESS` | `private` or `public` — must match the Blob store's access |
| `MISTRAL_API_KEY` | Mistral API key (https://console.mistral.ai/) |
| `MISTRAL_MODEL` | tool-capable model id; default `mistral-large-latest` |
| `DOC_PATH_ALLOWLIST` | optional comma-separated path prefixes the app may touch |

## Deploy (Vercel)

1. Import this repo in Vercel.
2. Create a **Blob** store (Storage tab) — it injects `BLOB_READ_WRITE_TOKEN` automatically; set `BLOB_ACCESS` to match.
3. Add `MISTRAL_API_KEY` and `MISTRAL_MODEL` as environment variables.
4. Deploy. Pushes to the connected branch redeploy automatically.

## How transparency works

`/api/chat` returns `toUIMessageStreamResponse({ sendReasoning: true })`. The browser's `useChat`
receives typed message **parts** — `reasoning`, `tool-searchFiles`/`tool-writeDocument`/…, and `text` —
which the AI bar renders as a live step trace. When a `writeDocument` tool result arrives, the editor
updates with the new document content immediately.

## Notes / limits

- File search is a lexical scan over Blob text docs — great for tens/hundreds of documents; revisit if
  the library grows to thousands.
- `MISTRAL_MODEL` can be swapped to `magistral-medium-2507` to get a reasoning model whose
  chain-of-thought is surfaced as `reasoning` parts in the step trace.
