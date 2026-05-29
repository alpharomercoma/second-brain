# qwen3-agentic-rag-fe

Next.js (App Router) frontend + agent brain for the Qwen3.5 idea assistant. Deploys on Vercel.

A Google-Docs-style editor whose file system is a VS-Code-like tree of documents (stored in **Vercel Blob**). A wide AI bar at the bottom runs an **agentic loop** (Vercel AI SDK) against a **Runpod Serverless** Qwen3.5-9B endpoint, searches your prior work via tool calling (no vector DB), and writes generated ideas straight into the open document.

```
Browser (useChat)
  └─ POST /api/chat ──► streamText(ideaModel, tools, stopWhen)
                          │   tools run here, over Vercel Blob:
                          │     searchFiles · readFile · listFiles · writeDocument
                          └─ @runpod/ai-sdk-provider ──► Runpod vLLM (Qwen3.5-9B on a 5090)
  └─ /api/files[...] ──► Vercel Blob CRUD (no GPU)
```

## Architecture

- **`lib/runpod.ts`** — AI SDK provider (`@ai-sdk/openai-compatible`) pointed at our Runpod endpoint's OpenAI route. (`@runpod/ai-sdk-provider` only targets Runpod's hosted public models — no custom `baseURL` — so it doesn't fit a custom serverless endpoint.)
- **`lib/blob-docs.ts`** — document CRUD over `@vercel/blob` (+ path allowlist; the token is full-store RW).
- **`lib/tools.ts`** — the agent tools (lexical file search + read/list/write). **No embeddings/reranker.**
- **`lib/prompt.ts`** — idea-generation system prompt (adapted from the reference repo).
- **`app/api/chat/route.ts`** — the agent loop; streams reasoning + tool steps + text (transparency).
- **`app/api/files/...`** — plain document CRUD (runs on Vercel, never wakes the GPU).
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
| `RUNPOD_API_KEY` | Runpod API key |
| `RUNPOD_ENDPOINT_ID` | the deployed vLLM endpoint id (see `qwen3-agentic-rag-be`) |
| `RUNPOD_MODEL` | `Qwen/Qwen3.5-9B` (must match the worker's `MODEL_NAME`) |
| `DOC_PATH_ALLOWLIST` | optional comma-separated path prefixes the app may touch |

## Deploy (Vercel)

1. Import this repo in Vercel.
2. Create a **Blob** store (Storage tab) — it injects `BLOB_READ_WRITE_TOKEN` automatically.
3. Add `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, `RUNPOD_MODEL` as environment variables.
4. Deploy.

## How transparency works

`/api/chat` returns `toUIMessageStreamResponse({ sendReasoning: true })`. The browser's `useChat`
receives typed message **parts** — `reasoning`, `tool-searchFiles`/`tool-writeDocument`/…, and `text` —
which the AI bar renders as a live step trace. When a `writeDocument` tool result arrives, the editor
updates with the new document content immediately.

## Notes / limits

- File search is a lexical scan over Blob text docs — great for tens/hundreds of documents; revisit if
  the library grows to thousands.
- See `qwen3-agentic-rag-be` for the GPU backend and the model/tool-calling caveats.
