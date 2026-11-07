import { beforeEach, vi } from 'vitest';

/** A stand-in for the browser's EventSource (jsdom has none); tests push events by hand. */
export class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  closed = false;

  constructor(readonly url: string) {
    super();
    FakeEventSource.instances.push(this);
  }

  emit(type: string, data?: unknown): void {
    this.dispatchEvent(
      new MessageEvent(type, { data: data === undefined ? undefined : JSON.stringify(data) }),
    );
  }

  close(): void {
    this.closed = true;
  }

  /** The newest open stream for a URL. */
  static last(url: string): FakeEventSource {
    const found = FakeEventSource.instances.filter((s) => s.url === url && !s.closed).at(-1);
    if (!found) throw new Error(`no open stream for ${url}`);
    return found;
  }
}

/** Installs the fake as the global EventSource for one test file. */
export const installFakeEventSource = (): void => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
};
