/**
 * The agent search field.
 *
 * It arrives as a point of light at the bottom of the frame and opens into a
 * field. Submitting closes it back to that point, throws the point at the graph,
 * and hands off to the inbound query signal, which carries the search in.
 *
 * The module owns only its own DOM and timing. Moving the animation clock to the
 * launch beat is the caller's job, via `launch`.
 */

export interface AgentSearchOptions {
  /** Screen position, in CSS pixels, where the inbound signal begins. */
  handoff: () => { x: number; y: number };
  /** Fired once the frame is dark: move the clock to the launch beat. */
  launch: (query: string) => void;
  /** How long the inbound signal flies, so the field reopens as the query lands. */
  flightSeconds: number;
}

const COLLAPSE_MS = 340;
const THROW_MS = 460;
const BLACK_AT_MS = 720;
const CLEAR_MS = 400;

export class AgentSearch {
  private readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly send: HTMLButtonElement;
  private readonly caption: HTMLElement;
  private readonly comet: HTMLElement;
  private readonly blink: HTMLElement;
  private readonly opts: AgentSearchOptions;
  private timers: number[] = [];
  private busy = false;
  private hadFocus = false;

  constructor(opts: AgentSearchOptions) {
    this.opts = opts;
    this.root = must('search');
    this.form = must('search-form') as HTMLFormElement;
    this.input = must('search-input') as HTMLInputElement;
    this.send = must('search-send') as HTMLButtonElement;
    this.caption = must('search-caption');
    this.comet = must('comet');
    this.blink = must('blink');

    this.input.addEventListener('input', () => this.syncSend());
    this.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.submit();
    });
    // Escape hands the keyboard back to the camera.
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') this.input.blur();
      ev.stopPropagation();
    });
    // The scene's camera and node-pick handlers are bound to window with no target
    // check, so without this a click in the field injects a stray query signal into
    // whichever node is nearest, and drag-selecting text orbits the camera.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'wheel', 'contextmenu']) {
      this.root.addEventListener(type, (ev) => ev.stopPropagation());
    }

    this.after(700, () => this.root.classList.add('awake'));
    this.after(1500, () => this.root.classList.add('open'));
  }

  /**
   * True while anything in the field holds the keyboard, so global shortcuts stand
   * down. This has to cover the send button too: with focus there, Space reached the
   * global handler and paused the animation instead of submitting.
   */
  get typing(): boolean {
    return this.root.contains(document.activeElement);
  }

  /** Hidden during export, where the frame must contain no chrome. */
  setHidden(hidden: boolean): void {
    this.root.classList.toggle('gone', hidden);
    if (hidden) this.input.blur();
  }

  private syncSend(): void {
    const ready = this.input.value.trim().length > 0 && !this.busy;
    this.send.classList.toggle('ready', ready);
    this.send.disabled = !ready;
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private submit(): void {
    const query = this.input.value.trim();
    if (!query || this.busy) return;
    this.busy = true;
    this.hadFocus = this.root.contains(document.activeElement);
    this.input.blur();
    this.input.disabled = true;
    this.syncSend();
    this.caption.textContent = 'Enviando…';

    const box = this.form.getBoundingClientRect();
    const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };

    this.root.classList.add('launching');
    this.root.classList.remove('open');

    // The point of light leaves the field and is thrown at the graph.
    this.after(COLLAPSE_MS - 40, () => {
      const to = this.opts.handoff();
      this.comet.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) scale(1)`, opacity: 1, offset: 0 },
          { transform: `translate(${to.x}px, ${to.y}px) scale(0.3)`, opacity: 0, offset: 1 },
        ],
        { duration: THROW_MS, easing: 'cubic-bezier(0.45, 0, 0.85, 0.5)', fill: 'forwards' },
      );
      this.blink.classList.add('on');
    });

    // Once the frame is dark the clock can move without a visible cut.
    this.after(BLACK_AT_MS, () => {
      this.opts.launch(query);
      this.blink.classList.remove('on');
    });

    // Reopen as the query lands, ready for the next one.
    this.after(BLACK_AT_MS + CLEAR_MS + this.opts.flightSeconds * 1000, () => {
      this.busy = false;
      this.input.disabled = false;
      this.input.value = '';
      this.caption.textContent = 'Presiona enter para enviar la consulta';
      this.root.classList.remove('launching');
      this.root.classList.add('open');
      this.syncSend();
      // Submitting blurs the field; a keyboard user gets it back rather than re-tabbing.
      if (this.hadFocus) this.input.focus();
    });
  }
}

function must(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`agent search: #${id} is missing from the document`);
  return node;
}
