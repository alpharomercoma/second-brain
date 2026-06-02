import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { getModel, resolveKey } from '@/lib/mistral';
import { buildTools, type DocSnapshot } from '@/lib/tools';
import { ideaSystemPrompt } from '@/lib/prompt';
import { normalizeParams, type ChatParams } from '@/lib/models';

export const maxDuration = 300;

type ChatBody = {
  messages: UIMessage[];
  openPath?: string;
  model?: string;
  params?: Partial<ChatParams>;
  apiKey?: string;
  docs?: DocSnapshot[];
};

// Bound the request so a huge local corpus can't OOM the function or run up the
// model context. Personal corpora are far smaller than this.
const MAX_DOCS = 2000;
const MAX_TOTAL_DOC_CHARS = 1_500_000;
const MAX_OPEN_PATH = 1024;

function sanitizeDocs(docs: unknown): DocSnapshot[] {
  if (!Array.isArray(docs)) return [];
  const out: DocSnapshot[] = [];
  let total = 0;
  for (const d of docs) {
    if (out.length >= MAX_DOCS) break;
    if (!d || typeof (d as any).path !== 'string' || typeof (d as any).content !== 'string') continue;
    const path = (d as any).path.slice(0, MAX_OPEN_PATH);
    let content = (d as any).content as string;
    if (total + content.length > MAX_TOTAL_DOC_CHARS) content = content.slice(0, Math.max(0, MAX_TOTAL_DOC_CHARS - total));
    if (!content && total >= MAX_TOTAL_DOC_CHARS) continue;
    total += content.length;
    out.push({ path, content });
  }
  return out;
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { messages, openPath, model, params, apiKey, docs } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'No messages provided.' }, { status: 400 });
  }

  const key = resolveKey(apiKey);
  if (!key) {
    return Response.json({ error: 'Add your Mistral API key to start chatting.' }, { status: 401 });
  }

  // The agent's tools run over the local-doc snapshot the client sent — no cloud
  // store. It discovers which files to read itself; every step streams to the UI.
  const tools = buildTools({
    openPath: typeof openPath === 'string' ? openPath.slice(0, MAX_OPEN_PATH) : undefined,
    docs: sanitizeDocs(docs),
  });
  const p = normalizeParams(params);

  const result = streamText({
    model: getModel(model, key),
    system: ideaSystemPrompt(typeof openPath === 'string' ? openPath : undefined),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(8),
    temperature: p.temperature,
    topP: p.topP,
    maxOutputTokens: p.maxTokens,
    maxRetries: 4,
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    // Surface a useful but NON-leaky message to the client (no stack/internals).
    onError: (error) => friendlyError(error),
    messageMetadata: ({ part }) => {
      if (part.type === 'finish') {
        const u = part.totalUsage;
        return {
          model: model ?? null,
          usage: {
            input: u?.inputTokens ?? 0,
            output: u?.outputTokens ?? 0,
            total: u?.totalTokens ?? (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0),
          },
        };
      }
    },
  });
}

function friendlyError(error: unknown): string {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('capacity'))
    return 'Mistral is rate-limiting right now — wait a few seconds and try again.';
  if (msg.includes('401') || msg.includes('unauthor') || msg.includes('invalid') && msg.includes('key') || msg.includes('api key'))
    return 'Your Mistral API key was rejected. Check it in settings (⚙) and try again.';
  if (msg.includes('timeout') || msg.includes('aborted'))
    return 'The request timed out. Try again, or pick a faster model.';
  return 'The assistant hit an error. Please try again.';
}
