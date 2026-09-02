// Adapted from design-system/packages/animator/src/lib/qa.ts
// (commit af7f04a0325c2455831f1ed102f58a9f7a4a02ac).
// Ported: the Anthropic SDK call shape (raw `@anthropic-ai/sdk`,
// `client.messages.create` with a single user-role prompt), the
// "return JSON only, no prose, no markdown fences" instruction, extracting the
// first text content block, matching the first `{...}` object out of it with a
// regex before `JSON.parse`, and throwing a descriptive error on an
// unparseable response rather than silently falling back.
//
// Not ported: `generateMockupContent`'s wider mockup shape (hero copy, nav
// items, product cards, scene-type toggles, spec/cart/datasheet/configurator
// turn kinds, catalog grounding) — this adapter only needs Q&A pairs and
// category labels, not a full chat-mockup script. Also not ported: language
// detection (`detectLanguage`/`resolveLanguage`) — this repo's caller always
// supplies an explicit `locale`, so there is nothing to detect from the DOM.
// Not ported: `MockupPipelineError`'s multi-code error type or the
// low-signal/blocked-page guards — Task 6's `scrape-adapter.ts` is
// responsible for scrape-quality checks upstream of this module.
//
// Simplified vs. upstream:
// - Upstream's confidence rating exists implicitly via post-hoc grounding
//   (`groundSpecTurns` checks spec lines against the crawled catalog after the
//   fact). This adapter asks the model to self-rate confidence per item
//   instead, because Task 5's `applyGroundingGate` operates on a
//   model-supplied `RatedItem<T>[]`, not a catalog cross-check — there is no
//   catalog here, only scraped page text.

import Anthropic from '@anthropic-ai/sdk';
import type { RatedItem } from '../grounding-gate';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface QaPair {
  question: string;
  answer: string;
}

export interface GenerateContentOptions {
  locale: string;
  company: string;
  /** Override Anthropic model. Defaults to the latest Sonnet identifier. */
  model?: string;
}

export interface GeneratedContent {
  queries: RatedItem<QaPair>[];
  categories: RatedItem<string>[];
}

const PROMPT_TEMPLATE = `You are drafting the search content for a knowledge-graph demo built for the prospect company "{{COMPANY}}", grounded ONLY in the page text supplied below.

Generate:
1. ~15 candidate question-and-answer pairs a real visitor to this company's site might search for, each with a concrete answer drawn only from the provided text.
2. ~8-10 candidate category labels that group this company's content/products/services, again drawn only from the provided text.

Write every question, answer, and category label in the locale "{{LOCALE}}". If the provided page text is written in a different language than "{{LOCALE}}", translate the content into "{{LOCALE}}" — never refuse or comment on the language mismatch, just produce the requested locale's text.

For every item, include a self-rated "confidence" between 0 and 1, defined precisely as: how directly is this supported by the provided text, not inferred or guessed. A fact stated plainly in the text should score high (0.8-1.0); something you had to piece together or infer should score low (below 0.5). Never invent an answer or category that has no basis in the text and then rate it high.

Return JSON ONLY in this shape (no prose, no markdown fences):
{
  "queries": [{ "question": "", "answer": "", "confidence": 0 }],
  "categories": [{ "name": "", "confidence": 0 }]
}

Pages follow between <<< >>>, each prefixed by its URL:
<<<
{{PAGES}}
>>>`;

export class QaGenerationError extends Error {}

function formatPagesForPrompt(pages: { url: string; text: string }[]): string {
  return pages.map((p) => `URL: ${p.url}\n${p.text}`).join('\n\n---\n\n');
}

interface RawQaResponse {
  queries?: { question?: unknown; answer?: unknown; confidence?: unknown }[];
  categories?: { name?: unknown; confidence?: unknown }[];
}

function parseResponse(raw: RawQaResponse): GeneratedContent {
  const queries: RatedItem<QaPair>[] = (raw.queries ?? []).map((q) => {
    if (typeof q.question !== 'string' || typeof q.answer !== 'string' || typeof q.confidence !== 'number') {
      throw new QaGenerationError('Model returned a malformed query item (expected question/answer/confidence)');
    }
    return { item: { question: q.question, answer: q.answer }, confidence: q.confidence };
  });
  const categories: RatedItem<string>[] = (raw.categories ?? []).map((c) => {
    if (typeof c.name !== 'string' || typeof c.confidence !== 'number') {
      throw new QaGenerationError('Model returned a malformed category item (expected name/confidence)');
    }
    return { item: c.name, confidence: c.confidence };
  });
  if (queries.length === 0 || categories.length === 0) {
    throw new QaGenerationError('Model returned no queries or no categories');
  }
  return { queries, categories };
}

/**
 * Ask Anthropic for grounded Q&A pairs and category labels from scraped page
 * text. Throws `QaGenerationError` when the response contains no parseable
 * JSON object or the parsed shape does not match the expected fields.
 */
export async function generateContent(
  pages: { url: string; text: string }[],
  opts: GenerateContentOptions,
): Promise<GeneratedContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new QaGenerationError('ANTHROPIC_API_KEY is required for Q&A content generation');
  }

  const client = new Anthropic({ apiKey });
  // Function-form replacements: the replacement text here is untrusted (scraped third-party
  // page text, an operator-supplied company name), and `String.replace`'s *string* form would
  // read `$&`, `$'`, "$`" or `$1` inside it as substitution patterns and corrupt the prompt.
  // The function form inserts the value literally.
  const prompt = PROMPT_TEMPLATE.replace('{{COMPANY}}', () => opts.company)
    .replace('{{LOCALE}}', () => opts.locale)
    .replace('{{PAGES}}', () => formatPagesForPrompt(pages));

  let response;
  try {
    response = await client.messages.create({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 4_000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    throw new QaGenerationError(`Anthropic call failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const block = response.content[0];
  const responseText = block && block.type === 'text' ? block.text : '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new QaGenerationError('LLM response did not contain a JSON object');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new QaGenerationError(
      `LLM response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return parseResponse(parsed as RawQaResponse);
}
