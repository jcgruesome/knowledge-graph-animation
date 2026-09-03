import { describe, expect, it, vi } from 'vitest';

process.env.ANTHROPIC_API_KEY = 'test-key';

const create = vi.fn().mockResolvedValue({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        queries: [{ question: 'What sizes do you offer?', answer: 'Sizes S-XL.', confidence: 0.9 }],
        categories: [{ name: 'Apparel', confidence: 0.95 }],
      }),
    },
  ],
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

const { generateContent } = await import('./qa-adapter');

describe('generateContent', () => {
  it('parses the model response into rated queries and categories', async () => {
    const result = await generateContent(
      [{ url: 'https://acme.example.com/faq', text: 'We offer sizes S through XL.' }],
      { locale: 'en', company: 'Acme' },
    );
    expect(result.queries[0]!.item.question).toBe('What sizes do you offer?');
    expect(result.queries[0]!.item.answer).toBe('Sizes S-XL.');
    expect(result.queries[0]!.confidence).toBe(0.9);
    expect(result.categories[0]!.item).toBe('Apparel');
    expect(result.categories[0]!.confidence).toBe(0.95);
  });

  it('throws a clear error when the model response has no JSON object', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'sorry, I cannot help with that' }],
    });
    await expect(
      generateContent([{ url: 'https://acme.example.com/faq', text: 'We offer sizes S through XL.' }], {
        locale: 'en',
        company: 'Acme',
      }),
    ).rejects.toThrow(/JSON/);
  });
});
