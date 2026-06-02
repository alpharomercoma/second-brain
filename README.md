# ThinkTrove

Your idea studio — brainstorm new talks, projects, and applications **grounded in your own body of work**. A Google-Docs-style editor over a VS-Code-like file tree, with a wide AI bar that runs an **agentic loop** (Vercel AI SDK) on the **Mistral AI API**, searches your prior work via tool calling (no vector DB), and writes generated ideas straight into the open document.

**Local-first:** your documents live in the browser (IndexedDB) and you enter your own Mistral key in the app. No account, no server store — so it's instant, and a production deploy needs **no secrets**.

```
Browser
  ├─ IndexedDB (your documents) ──┐ snapshot sent with each request
  └─ useChat ─ POST /api/chat ─────┴─► streamText(model, tools, stopWhen)
                                         │  tools run server-side over that snapshot:
                                         │    searchFiles · readFile · listFiles · writeDocument
                                         └─ @ai-sdk/mistral ──► Mistral API (mistral-large-latest)
  ◄── streamed reasoning + tool steps + text ── writeDocument result persists to IndexedDB + editor
```

## Architecture

- **`lib/docs-local.ts`** — local-first document store in IndexedDB (via `idb-keyval`). Files/folders are paths; includes `seedIfEmpty()` (onboarding doc) and a versioned `migrate()` hook.
- **`lib/mistral.ts`** — AI SDK provider (`@ai-sdk/mistral`). `resolveKey()` uses the user's key; a server env key is honored **only** when `MISTRAL_ALLOW_SERVER_KEY=1` (so the deploy can't become an open proxy).
- **`lib/models.ts`** — client-safe model list + generation params (no secrets).
- **`lib/tools.ts`** — agent tools (lexical file search + read/list/write) over the per-request doc snapshot. **No embeddings/reranker.**
- **`lib/prompt.ts`** — idea-generation system prompt; tells the agent to discover/read docs via tools and cite paths.
- **`lib/usage.ts` / `lib/history.ts`** — local-first token/tool analytics and conversation history.
- **`app/api/chat/route.ts`** — the agent loop; validates input, streams reasoning + tool steps + text, attaches token-usage metadata.
- **`app/page.tsx` + `components/`** — file tree, editor, AI bar.
- **`app/analytics/page.tsx`** — usage dashboard (tokens in/out, tool calls), computed from local data.

## Setup

```bash
npm install
npm run dev   # http://localhost:3000 — enter your Mistral key in the app
```

No `.env` is required. For a private demo or local testing you can let the server fall back to a shared key (see `.env.example`):

```bash
cp .env.example .env.local
# uncomment + fill MISTRAL_ALLOW_SERVER_KEY=1 and MISTRAL_API_KEY
```

### Env (all optional — see `.env.example`)

| Variable | Purpose |
|---|---|
| `MISTRAL_ALLOW_SERVER_KEY` | `1` to allow a server fallback key (off by default; **not for production**) |
| `MISTRAL_API_KEY` | shared fallback key, used only when the flag above is set ([console.mistral.ai](https://console.mistral.ai/)) |
| `MISTRAL_MODEL` | override the default model id (`mistral-large-latest`) |

## Deploy (Vercel)

1. Import this repo in Vercel.
2. Deploy with an **empty** environment — each user supplies their own key in the app.
3. Pushes to the connected branch redeploy automatically.

## How transparency works

`/api/chat` returns `toUIMessageStreamResponse({ sendReasoning: true })`. The browser's `useChat`
receives typed message **parts** — `reasoning`, `tool-searchFiles`/`tool-writeDocument`/…, and `text` —
which the AI bar renders as a collapsible step trace. When a `writeDocument` result arrives, the editor
updates immediately and the change is persisted to IndexedDB.

## Notes / limits

- File search is a lexical scan over your text docs — great for tens/hundreds of documents; revisit if
  the library grows to thousands.
- Pick a reasoning model (e.g. `magistral-medium-2507`) in the model picker to surface chain-of-thought
  as `reasoning` parts in the trace.
- Built on the Vercel AI SDK v6 (`ai@6`, `@ai-sdk/mistral@3`, `@ai-sdk/react@3`).
