/**
 * Drives the visible search field on its own: types each real support question in,
 * pauses, and submits it, so the demo runs hands-off. Backs off whenever a person is
 * actually focused in the field, so it never fights a live visitor.
 */
export interface AutoplayQuery {
  question: string;
}

const CHAR_DELAY_MS = 38;
const SETTLE_DELAY_MS = 650;

function typeInto(input: HTMLInputElement, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let i = 0;
    const step = (): void => {
      if (document.activeElement === input) {
        resolve(false); // a person took over; hand the field back to them
        return;
      }
      i++;
      input.value = text.slice(0, i);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (i >= text.length) {
        resolve(true);
        return;
      }
      window.setTimeout(step, CHAR_DELAY_MS + Math.random() * 30);
    };
    step();
  });
}

/**
 * `cycleMs` should be roughly one full choreography loop; each auto-typed question gets
 * its own dedicated loop to resolve in, so successive submissions never truncate one another.
 */
export function startAutoplay(queries: AutoplayQuery[], cycleMs: number, startDelayMs = 4000): void {
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const form = document.getElementById('search-form') as HTMLFormElement | null;
  if (!input || !form || queries.length === 0) return;

  let i = 0;
  const runNext = (): void => {
    window.setTimeout(runNext, cycleMs);
    if (document.activeElement === input || input.disabled) return;
    const question = queries[i % queries.length]!.question;
    i++;
    typeInto(input, question).then((finished) => {
      if (!finished || input.disabled) return;
      window.setTimeout(() => {
        if (input.value.trim().length > 0 && !input.disabled && document.activeElement !== input) form.requestSubmit();
      }, SETTLE_DELAY_MS);
    });
  };
  window.setTimeout(runNext, startDelayMs);
}
