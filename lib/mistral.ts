import { createMistral } from '@ai-sdk/mistral';
import { DEFAULT_MODEL, isKnownModel } from './models';

/**
 * SERVER-ONLY. Builds a Mistral model for one request, using the API key the
 * user supplied (local-first: the key is entered in the browser and sent with
 * each chat request). Falls back to a server env key if present — handy for
 * local testing — but normal use is the user's own key.
 *
 * Version note: `@ai-sdk/mistral@^2` targets `@ai-sdk/provider@2`, matching `ai@5`.
 */
const ENV_DEFAULT = process.env.MISTRAL_MODEL ?? DEFAULT_MODEL;

/**
 * The request must carry the user's own key. A server-side env key is used ONLY
 * as a fallback when explicitly opted in via MISTRAL_ALLOW_SERVER_KEY=1 — this
 * prevents the deployed app from becoming an open proxy that bills the operator's
 * key. By default (production), no user key ⇒ no request.
 */
export function resolveKey(userKey?: string): string | undefined {
  const k = userKey?.trim();
  if (k) return k;
  if (process.env.MISTRAL_ALLOW_SERVER_KEY === '1') return process.env.MISTRAL_API_KEY || undefined;
  return undefined;
}

/** Resolve a model for one request. Only known model ids are honored. */
export function getModel(id: string | undefined, apiKey: string) {
  const mistral = createMistral({ apiKey });
  return mistral(isKnownModel(id) ? id : ENV_DEFAULT);
}
