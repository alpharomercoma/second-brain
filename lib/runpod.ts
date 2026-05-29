import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * Vercel AI SDK provider pointed at OUR Runpod Serverless vLLM endpoint's
 * OpenAI-compatible route (NOT Runpod's hosted public models):
 *
 *   https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1
 *
 * NOTE: `@runpod/ai-sdk-provider` only targets Runpod's hosted model catalog
 * (no custom baseURL), so we use `@ai-sdk/openai-compatible` instead — the
 * Runpod vLLM worker is OpenAI-compatible and supports streaming + tool calling.
 */
const endpointId = process.env.RUNPOD_ENDPOINT_ID;
if (!endpointId) {
  console.warn('[runpod] RUNPOD_ENDPOINT_ID is not set — chat will not work.');
}

export const MODEL_ID = process.env.RUNPOD_MODEL ?? 'Qwen/Qwen3.5-9B';

/**
 * Inject `chat_template_kwargs: { enable_thinking: false }` into every request.
 *
 * Qwen3.5 is a "thinking" model: left on, it spends hundreds of tokens in a
 * <think> block before emitting a tool call — slow, and it muddles tool-call
 * streaming. Disabling thinking makes the agent emit `<function=…>` tool calls
 * immediately (parsed by vLLM's qwen3_coder parser). The OpenAI-compatible
 * provider doesn't expose this field directly, so we splice it into the body.
 */
const noThinkFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      body.chat_template_kwargs = { ...(body.chat_template_kwargs ?? {}), enable_thinking: false };
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      /* leave body untouched if it isn't JSON */
    }
  }
  return fetch(input as Parameters<typeof fetch>[0], init);
};

export const runpod = createOpenAICompatible({
  name: 'runpod-vllm',
  baseURL: `https://api.runpod.ai/v2/${endpointId}/openai/v1`,
  apiKey: process.env.RUNPOD_API_KEY,
  fetch: noThinkFetch,
});

/** The chat model used by the idea agent. */
export const ideaModel = runpod.chatModel(MODEL_ID);
