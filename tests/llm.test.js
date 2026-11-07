// Tests for server/llm.js — provider abstraction, structured-output
// validation, mock labelling, and the not-configured state. No network:
// the OpenAI provider is exercised with a stubbed fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLlmConfig, validateJson, assertValidJson, extractJson,
  normalizeStructuredOutput,
  createMockProvider, createOpenAiProvider, createProvider,
  LlmNotConfiguredError, LlmOutputError,
} from '../server/llm.js';

const DRAFT_SCHEMA = {
  type: 'object',
  required: ['draft', 'role'],
  properties: {
    draft: { type: 'string', minLength: 1 },
    role: { type: 'string', enum: ['facilitator', 'researcher'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  additionalProperties: false,
};

test('resolveLlmConfig: no key means not configured (first-class state, not an error)', () => {
  const c = resolveLlmConfig({});
  assert.equal(c.configured, false);
  assert.equal(c.provider, 'none');
  assert.equal(c.apiKeyPresent, false);
  assert.equal(c._apiKey, '');
});

test('resolveLlmConfig: a key alone selects the openai provider', () => {
  const c = resolveLlmConfig({ CONVERGE_LLM_API_KEY: 'sk-test', CONVERGE_LLM_MODEL: 'gpt-4o' });
  assert.equal(c.configured, true);
  assert.equal(c.provider, 'openai');
  assert.equal(c.model, 'gpt-4o');
  assert.equal(c.apiKeyPresent, true);
});

test('resolveLlmConfig: explicit mock provider is configured without a key', () => {
  const c = resolveLlmConfig({ CONVERGE_LLM_PROVIDER: 'mock' });
  assert.equal(c.configured, true);
  assert.equal(c.provider, 'mock');
});

test('resolveLlmConfig: unknown provider is not configured', () => {
  const c = resolveLlmConfig({ CONVERGE_LLM_PROVIDER: 'claude', CONVERGE_LLM_API_KEY: 'x' });
  assert.equal(c.configured, false);
});

test('createProvider: not configured -> complete() throws LlmNotConfiguredError', async () => {
  const p = createProvider({});
  assert.equal(p.configured, false);
  await assert.rejects(() => p.complete({ messages: [{ role: 'user', content: 'hi' }], schema: DRAFT_SCHEMA }), LlmNotConfiguredError);
});

test('createMockProvider: labelled mock, valid structured output passes', async () => {
  const p = createMockProvider({
    respond: () => ({ draft: 'test draft', role: 'facilitator', confidence: 'high' }),
  });
  assert.equal(p.isMock, true);
  assert.equal(p.name, 'mock');
  const out = await p.complete({ messages: [{ role: 'user', content: 'hi' }], schema: DRAFT_SCHEMA });
  assert.equal(out.mock, true);
  assert.equal(out.provider, 'mock');
  assert.equal(out.data.draft, 'test draft');
});

test('mock provider: the default respond is labelled and never claims to be live', async () => {
  const p = createMockProvider();
  const out = await p.complete({
    messages: [{ role: 'user', content: 'hi' }],
    schema: { type: 'object', required: ['draft'], properties: { draft: { type: 'string' } }, additionalProperties: true },
  });
  assert.match(out.data.draft, /MOCK/);
  assert.equal(out.mock, true);
});

test('validateJson: accepts valid output, reports every problem', () => {
  assert.deepEqual(validateJson({ draft: 'x', role: 'facilitator' }, DRAFT_SCHEMA), []);
  const bad = validateJson({ draft: '', role: 'wizard', extra: 1 }, DRAFT_SCHEMA);
  assert.ok(bad.some((e) => e.includes('minLength')));
  assert.ok(bad.some((e) => e.includes('enum')));
  assert.ok(bad.some((e) => e.includes('unexpected property "extra"')));
  const missing = validateJson({ role: 'facilitator' }, DRAFT_SCHEMA);
  assert.ok(missing.some((e) => e.includes('missing required property "draft"')));
});

test('validateJson: type mismatches and nested/array checks', () => {
  assert.ok(validateJson('nope', DRAFT_SCHEMA).some((e) => e.includes('expected object')));
  const schema = { type: 'object', properties: { n: { type: 'integer', minimum: 0, maximum: 10 }, tags: { type: 'array', items: { type: 'string' } } } };
  assert.deepEqual(validateJson({ n: 3, tags: ['a'] }, schema), []);
  assert.ok(validateJson({ n: 11 }, schema).some((e) => e.includes('maximum')));
  assert.ok(validateJson({ n: 2.5 }, schema).some((e) => e.includes('integer')));
  assert.ok(validateJson({ tags: [1] }, schema).some((e) => e.includes('expected string')));
});

test('assertValidJson throws LlmOutputError on invalid output', () => {
  assert.throws(() => assertValidJson({ role: 'facilitator' }, DRAFT_SCHEMA), LlmOutputError);
});

test('extractJson: plain JSON, fenced JSON, and no-JSON rejection', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Here is the result:\n```json\n{"a":2}\n```'), { a: 2 });
  assert.throws(() => extractJson('just some prose, no json at all'), LlmOutputError);
});

// Live-model shape fix (2026-11-07): Qwen3 on Cloudflare Workers AI
// returned caveats as a single string, not an array, and the draft was
// rejected. Normalisation wraps the string verbatim; anything else
// still fails validation.
test('normalizeStructuredOutput: string caveats wraps to an array, content preserved', () => {
  const out = normalizeStructuredOutput({ draft: 'x', role: 'facilitator', caveats: 'single caveat', needsHumanReview: true });
  assert.deepEqual(out.caveats, ['single caveat']);
  assert.equal(out.draft, 'x');
  // An array is left alone; a non-object passes through untouched.
  assert.deepEqual(normalizeStructuredOutput({ caveats: ['a', 'b'] }).caveats, ['a', 'b']);
  assert.equal(normalizeStructuredOutput(null), null);
  assert.equal(normalizeStructuredOutput('text'), 'text');
});

test('createOpenAiProvider: string caveats is normalised and passes validation (stubbed fetch)', async () => {
  const stubFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"draft":"hello","role":"facilitator","confidence":"medium","caveats":"one caveat","needsHumanReview":true}' } }] }),
  });
  const p = createOpenAiProvider({ apiKey: 'sk-secret', baseUrl: 'https://example.invalid/v1', model: 'test-model', fetchImpl: stubFetch });
  const schema = {
    type: 'object',
    required: ['draft', 'role', 'confidence', 'caveats', 'needsHumanReview'],
    properties: {
      draft: { type: 'string', minLength: 1 },
      role: { type: 'string', enum: ['facilitator', 'researcher'] },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      caveats: { type: 'array', items: { type: 'string' } },
      needsHumanReview: { type: 'boolean' },
    },
    additionalProperties: false,
  };
  const result = await p.complete({ messages: [{ role: 'user', content: 'hi' }], schema });
  assert.deepEqual(result.data.caveats, ['one caveat']);
  assert.equal(result.mock, false);
});

test('createOpenAiProvider: a non-string, non-array caveats still fails validation', async () => {
  const stubFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"draft":"hello","role":"facilitator","confidence":"medium","caveats":42,"needsHumanReview":true}' } }] }),
  });
  const p = createOpenAiProvider({ apiKey: 'sk-secret', baseUrl: 'https://example.invalid/v1', model: 'test-model', fetchImpl: stubFetch });
  const schema = {
    type: 'object',
    required: ['draft', 'role', 'confidence', 'caveats', 'needsHumanReview'],
    properties: {
      draft: { type: 'string', minLength: 1 },
      role: { type: 'string', enum: ['facilitator', 'researcher'] },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      caveats: { type: 'array', items: { type: 'string' } },
      needsHumanReview: { type: 'boolean' },
    },
    additionalProperties: false,
  };
  await assert.rejects(() => p.complete({ messages: [{ role: 'user', content: 'hi' }], schema }), LlmOutputError);
});

test('createOpenAiProvider: happy path returns validated data (stubbed fetch)', async () => {
  let seenUrl = '';
  let seenHeaders = {};
  let seenBody = null;
  const stubFetch = async (url, opts) => {
    seenUrl = url;
    seenHeaders = opts.headers;
    seenBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"draft":"hello","role":"researcher","confidence":"medium"}' } }] }),
    };
  };
  const p = createOpenAiProvider({ apiKey: 'sk-secret', baseUrl: 'https://example.invalid/v1', model: 'test-model', fetchImpl: stubFetch });
  const out = await p.complete({ messages: [{ role: 'user', content: 'hi' }], schema: DRAFT_SCHEMA });
  assert.equal(out.data.draft, 'hello');
  assert.equal(out.mock, false);
  assert.equal(seenUrl, 'https://example.invalid/v1/chat/completions');
  assert.equal(seenHeaders.Authorization, 'Bearer sk-secret');
  assert.equal(seenBody.model, 'test-model');
  assert.equal(seenBody.response_format.type, 'json_object');
});

test('createOpenAiProvider: non-JSON model output is rejected, never passed through', async () => {
  const stubFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
  });
  const p = createOpenAiProvider({ apiKey: 'k', baseUrl: 'https://example.invalid/v1', model: 'm', fetchImpl: stubFetch });
  await assert.rejects(() => p.complete({ messages: [{ role: 'user', content: 'hi' }], schema: DRAFT_SCHEMA }), LlmOutputError);
});

test('createOpenAiProvider: schema-violating JSON is rejected', async () => {
  const stubFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"draft":"x","role":"wizard"}' } }] }),
  });
  const p = createOpenAiProvider({ apiKey: 'k', baseUrl: 'https://example.invalid/v1', model: 'm', fetchImpl: stubFetch });
  await assert.rejects(() => p.complete({ messages: [{ role: 'user', content: 'hi' }], schema: DRAFT_SCHEMA }), /failed validation/);
});

test('createOpenAiProvider: HTTP errors surface as LlmOutputError without the key', async () => {
  const stubFetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const p = createOpenAiProvider({ apiKey: 'sk-do-not-leak', baseUrl: 'https://example.invalid/v1', model: 'm', fetchImpl: stubFetch });
  await assert.rejects(
    () => p.complete({ messages: [{ role: 'user', content: 'hi' }], schema: DRAFT_SCHEMA }),
    (err) => err instanceof LlmOutputError && !err.message.includes('sk-do-not-leak'),
  );
});

test('createOpenAiProvider: empty messages are rejected', async () => {
  const p = createOpenAiProvider({ apiKey: 'k', baseUrl: 'https://example.invalid/v1', model: 'm', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(() => p.complete({ messages: [], schema: DRAFT_SCHEMA }), LlmOutputError);
});
