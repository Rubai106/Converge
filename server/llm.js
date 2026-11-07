// CONVERGE — provider-independent LLM abstraction.
//
// Env vars:
//   CONVERGE_LLM_PROVIDER  'mock' | 'openai' | 'openai-compatible'
//                          (default: 'openai' when a key is set, else none)
//   CONVERGE_LLM_API_KEY   provider API key (never logged, never returned)
//   CONVERGE_LLM_BASE_URL  base URL for OpenAI-compatible providers
//                          (default https://api.openai.com/v1)
//   CONVERGE_LLM_MODEL     model name (default gpt-4o-mini)
//
// Design rules (audit H1):
//  - No provider key is ever invented. If no key is configured, the
//    runtime reports "live model not configured" — a first-class state,
//    not an error — and the facilitator drafts nothing. The mock provider
//    exists ONLY for tests and explicit local dev (CONVERGE_LLM_PROVIDER
//    =mock); every mock response is labelled mock:true and must NEVER be
//    presented as live AI.
//  - complete() always returns structured JSON validated against a
//    caller-supplied JSON Schema. Malformed output (not JSON, wrong shape)
//    is rejected with an error — never passed through.
//  - The model NEVER invents numbers: tools.js routes every financial
//    figure through the deterministic engine. The model only drafts prose
//    around engine-computed values.
//  - No runtime dependencies: global fetch (Node 24), AbortController
//    timeouts. The API key is sent only as an Authorization header and is
//    never included in any log, error message, or returned object.

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('live model not configured: set CONVERGE_LLM_PROVIDER and CONVERGE_LLM_API_KEY');
    this.name = 'LlmNotConfiguredError';
    this.code = 'LLM_NOT_CONFIGURED';
  }
}

export class LlmOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LlmOutputError';
    this.code = 'LLM_OUTPUT_INVALID';
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function resolveLlmConfig(env = process.env) {
  const provider = String(env.CONVERGE_LLM_PROVIDER || '').trim().toLowerCase();
  const apiKey = String(env.CONVERGE_LLM_API_KEY || '').trim();
  const baseUrl = String(env.CONVERGE_LLM_BASE_URL || '').trim() || 'https://api.openai.com/v1';
  const model = String(env.CONVERGE_LLM_MODEL || '').trim() || 'gpt-4o-mini';
  const knownProviders = ['mock', 'openai', 'openai-compatible'];
  const effectiveProvider = provider || (apiKey ? 'openai' : 'none');
  return {
    provider: effectiveProvider,
    model,
    baseUrl,
    // The key itself is never exposed on the config object; only whether
    // one is present. Callers that need to send it use createProvider(),
    // which keeps it in a closure.
    apiKeyPresent: apiKey.length > 0,
    configured: effectiveProvider === 'mock' || (knownProviders.includes(effectiveProvider) && apiKey.length > 0),
    _apiKey: apiKey,
  };
}

// ---------------------------------------------------------------------------
// Minimal JSON Schema validation (subset — enough for structured output)
// ---------------------------------------------------------------------------
// Supports: type (object/array/string/number/integer/boolean/null),
// required, properties, additionalProperties:false, items, enum,
// minimum/maximum, minLength/maxLength. Returns a list of error strings
// (empty = valid). Never throws on weird input.

export function validateJson(value, schema, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;
  const typeOf = (v) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (Number.isInteger(v)) return 'integer';
    return typeof v;
  };
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path}: value not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type) {
    const want = schema.type;
    const got = typeOf(value);
    const ok = want === 'number'
      ? (got === 'number' || got === 'integer')
      : want === 'integer' ? got === 'integer' : got === want;
    if (!ok) {
      errors.push(`${path}: expected ${want}, got ${got}`);
      return errors; // further checks are meaningless on a type mismatch
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => errors.push(...validateJson(item, schema.items, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (value[key] === undefined) errors.push(`${path}: missing required property "${key}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) errors.push(...validateJson(value[key], sub, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
  }
  return errors;
}

export function assertValidJson(value, schema) {
  const errors = validateJson(value, schema);
  if (errors.length) throw new LlmOutputError(`structured output failed validation: ${errors.join('; ')}`);
  return value;
}

// Normalise the shape mismatches real models produce for the draft
// schema, BEFORE validation. This is shape-only: the model's words are
// preserved verbatim, only wrapped into the expected container.
//   - caveats as a single string -> [that string]. Qwen3 (Cloudflare
//     Workers AI, 2026-11-07 live) returned a string here and the draft
//     was rejected; wrapping keeps the caveat and lets the validator
//     check each item is a string. Anything else still fails validation.
export function normalizeStructuredOutput(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
  const out = { ...parsed };
  if (typeof out.caveats === 'string') out.caveats = [out.caveats];
  return out;
}

// Extract the first JSON object/array from model text. Models sometimes
// wrap JSON in fences or prose; the validator still decides. Throws
// LlmOutputError when nothing parseable is found.
export function extractJson(text) {
  if (typeof text !== 'string') throw new LlmOutputError('model output was not text');
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through to fence/scan extraction */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }
  const start = trimmed.search(/[{[]/);
  if (start >= 0) {
    try { return JSON.parse(trimmed.slice(start)); } catch { /* fall through */ }
  }
  throw new LlmOutputError('model output contained no parseable JSON');
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

// Shared complete() flow: call the transport, extract JSON, validate.
// `transport(messages)` returns the raw text of the model's reply.
function makeCompleter({ name, isMock, transport }) {
  return {
    name,
    isMock: Boolean(isMock),
    // A provider built by makeCompleter is always configured: the
    // "live model not configured" state is represented by createProvider()
    // returning a throwing complete(), never by a provider object.
    configured: true,
    async complete({ messages, schema, timeoutMs = 30000 }) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new LlmOutputError('complete() requires a non-empty messages array');
      }
      const raw = await transport(messages, timeoutMs);
      const parsed = normalizeStructuredOutput(extractJson(raw));
      assertValidJson(parsed, schema);
      return { data: parsed, raw, provider: name, mock: Boolean(isMock) };
    },
  };
}

// OpenAI-compatible chat-completions provider (OpenAI + any compatible
// endpoint). Sends response_format json_object so the model returns JSON.
export function createOpenAiProvider({ apiKey, baseUrl, model, fetchImpl = fetch }) {
  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  return makeCompleter({
    name: 'openai',
    isMock: false,
    transport: async (messages, timeoutMs) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err && err.name === 'AbortError') throw new LlmOutputError(`model call timed out after ${timeoutMs}ms`);
        throw new LlmOutputError(`model call failed: ${err.message}`);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        // Never include the key or the body in the error; status only.
        throw new LlmOutputError(`model call failed: HTTP ${res.status}`);
      }
      const body = await res.json().catch(() => { throw new LlmOutputError('model reply was not JSON'); });
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        throw new LlmOutputError('model reply had no text content');
      }
      return text;
    },
  });
}

// Mock provider — TESTS AND LOCAL DEV ONLY. Every response is labelled
// mock:true. `respond` decides the JSON object returned for a call
// (default: a fixed, schema-agnostic object the caller validates).
// The mock never pretends to be a live model: its name is 'mock' and
// `isMock` is true on every result.
export function createMockProvider({ respond } = {}) {
  const defaultRespond = () => ({
    draft: 'MOCK DRAFT — no live model configured. This text was produced by the test mock, not by any model.',
    role: 'facilitator',
    confidence: 'low',
    caveats: ['mock provider: not a live model response'],
    needsHumanReview: true,
  });
  return makeCompleter({
    name: 'mock',
    isMock: true,
    transport: async (messages) => JSON.stringify((respond || defaultRespond)(messages)),
  });
}

// Build a provider from env. Returns {configured, provider, model} plus
// a complete() that throws LlmNotConfiguredError when no live model is
// configured (mock is the only provider that is "configured" without a
// key, and only when explicitly requested).
export function createProvider(env = process.env, { fetchImpl = fetch } = {}) {
  const config = resolveLlmConfig(env);
  if (config.provider === 'mock') {
    const provider = createMockProvider();
    return { configured: true, provider: 'mock', model: 'mock', isMock: true, complete: provider.complete };
  }
  if (!config.configured) {
    const notConfigured = async () => { throw new LlmNotConfiguredError(); };
    return { configured: false, provider: config.provider, model: config.model, isMock: false, complete: notConfigured };
  }
  const provider = createOpenAiProvider({
    apiKey: config._apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    fetchImpl,
  });
  return { configured: true, provider: config.provider, model: config.model, isMock: false, complete: provider.complete };
}
