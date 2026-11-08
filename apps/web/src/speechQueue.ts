/** Fila curta: nunca toca uma conversa atrasada nem sobrepõe falantes. */
export interface SpeechLine {
  text: string;
  seat: number;
  pitch: number;
  rate: number;
  at: number;
  clip?: string;
  /** Fala local: personagem e variação dentro do arquivo dele. */
  character?: string;
  variant?: number;
}

export interface SpeechDriver {
  speak(line: SpeechLine, started: () => void, ended: (failed?: boolean) => void): void;
  cancel(): void;
}

export class SpeechQueue {
  private pending: SpeechLine[] = [];
  private current: SpeechLine | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private driver: SpeechDriver;
  private change: (line: SpeechLine | null, failed?: boolean) => void;
  private now: () => number;

  constructor(driver: SpeechDriver, change: (line: SpeechLine | null, failed?: boolean) => void, now = () => performance.now()) {
    this.driver = driver;
    this.change = change;
    this.now = now;
  }

  /** Alguém falando ou esperando a vez: as reações ficam para outra hora. */
  get busy(): boolean {
    return this.current !== null || this.pending.length > 0;
  }

  enqueue(line: SpeechLine): void {
    this.pending = [...this.pending.slice(-2), line];
    this.next();
  }

  cancel(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.pending = [];
    const hadCurrent = this.current !== null;
    this.current = null;
    if (hadCurrent) this.driver.cancel();
    this.change(null);
  }

  private next(): void {
    if (this.current) return;
    this.pending = this.pending.filter(line => this.now() - line.at < 700);
    const line = this.pending.shift();
    if (!line) return;
    this.current = line;
    let didStart = false;
    const generation = ++this.generation;
    const finish = (failed = false) => {
      if (generation !== this.generation || this.current !== line) return;
      clearTimeout(this.timer);
      this.current = null;
      this.change(null, failed || !didStart);
      this.next();
    };
    const timeout = () => {
      // Invalida callbacks antigos antes de cancel(), que pode chamar onerror imediatamente.
      this.generation++;
      this.driver.cancel();
      this.current = null;
      this.pending = [];
      this.change(null, true);
    };
    this.timer = setTimeout(timeout, 2200);
    try {
      this.driver.speak(line, () => {
        if (generation !== this.generation || this.current !== line) return;
        didStart = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(timeout, 5500);
        this.change(line);
      }, finish);
    } catch {
      finish(true);
    }
  }
}

export function portugueseVoices<T extends { lang: string; localService: boolean; name: string }>(voices: T[]): T[] {
  const language = (v: T) => v.lang.toLowerCase().replace('_', '-');
  return voices.filter(v => /^pt(?:-|$)/.test(language(v))).sort((a, b) =>
    Number(language(b) === 'pt-br') - Number(language(a) === 'pt-br') ||
    Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
}
