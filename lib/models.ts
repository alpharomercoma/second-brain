/**
 * Client-safe model metadata + chat parameter defaults.
 *
 * IMPORTANT: this file holds NO secrets — it is imported by both the browser
 * (components/AiBar.tsx, for the model picker + settings) and the server
 * (app/api/chat/route.ts). The actual provider/API key lives in lib/mistral.ts,
 * which must stay server-only.
 */

export type ModelInfo = {
  id: string;
  label: string;
  note?: string;
  /** Reasoning model — surfaces chain-of-thought as `reasoning` parts. */
  reasoning?: boolean;
};

/** Tool-capable Mistral chat models offered in the picker. */
export const MODELS: ModelInfo[] = [
  { id: 'mistral-large-latest', label: 'Mistral Large', note: 'Best tool use & depth' },
  { id: 'mistral-medium-latest', label: 'Mistral Medium', note: 'Balanced' },
  { id: 'mistral-small-latest', label: 'Mistral Small', note: 'Fast & cheap' },
  { id: 'magistral-medium-2507', label: 'Magistral Medium', note: 'Reasoning', reasoning: true },
  { id: 'magistral-small-2507', label: 'Magistral Small', note: 'Reasoning · fast', reasoning: true },
  { id: 'pixtral-large-latest', label: 'Pixtral Large', note: 'Vision + tools' },
];

export const DEFAULT_MODEL = 'mistral-large-latest';

export function isKnownModel(id: string | undefined): id is string {
  return !!id && MODELS.some((m) => m.id === id);
}

export function modelInfo(id: string | undefined): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Sampling / generation controls exposed in the settings popover. */
export type ChatParams = {
  temperature: number;
  topP: number;
  maxTokens: number;
};

export const DEFAULT_PARAMS: ChatParams = {
  temperature: 0.7,
  // 0.95 nucleus sampling: trims the unreliable long tail while keeping ideas
  // varied — a better default than 1.0 for grounded brainstorming.
  topP: 0.95,
  maxTokens: 2048,
};

/** Allowed ranges (also enforced server-side). */
export const PARAM_RANGE = {
  temperature: { min: 0, max: 1, step: 0.05 },
  topP: { min: 0, max: 1, step: 0.05 },
  maxTokens: { min: 256, max: 8192, step: 256 },
} as const;

const clamp = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

/** Normalize possibly-partial/untrusted params to safe values. */
export function normalizeParams(p?: Partial<ChatParams>): ChatParams {
  return {
    temperature: clamp(
      p?.temperature ?? DEFAULT_PARAMS.temperature,
      PARAM_RANGE.temperature.min,
      PARAM_RANGE.temperature.max,
    ),
    topP: clamp(p?.topP ?? DEFAULT_PARAMS.topP, PARAM_RANGE.topP.min, PARAM_RANGE.topP.max),
    maxTokens: Math.round(
      clamp(p?.maxTokens ?? DEFAULT_PARAMS.maxTokens, PARAM_RANGE.maxTokens.min, PARAM_RANGE.maxTokens.max),
    ),
  };
}
