import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { ideaModel } from '@/lib/runpod';
import { buildTools } from '@/lib/tools';
import { ideaSystemPrompt } from '@/lib/prompt';

// The agent runs several tool steps; allow a long-running stream.
export const maxDuration = 300;

type ChatBody = {
  messages: UIMessage[];
  openPath?: string;
  contextPaths?: string[];
};

export async function POST(req: Request) {
  const { messages, openPath, contextPaths } = (await req.json()) as ChatBody;

  const result = streamText({
    model: ideaModel,
    system: ideaSystemPrompt(openPath, contextPaths),
    messages: convertToModelMessages(messages),
    tools: buildTools({ openPath }),
    // Multi-step agent loop: generate -> tool call -> execute -> feed back ->
    // repeat, up to 6 steps (≈ reference repo's max_iterations).
    stopWhen: stepCountIs(6),
    temperature: 0.7, // creative idea generation
  });

  // Streams reasoning, tool-call, tool-result, and text parts to the client —
  // the "transparency" requirement, with no custom event protocol.
  return result.toUIMessageStreamResponse({ sendReasoning: true });
}
