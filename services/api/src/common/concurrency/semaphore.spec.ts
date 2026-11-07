import { Semaphore } from './semaphore.js';

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Semaphore', () => {
  it('runs at most `slots` jobs at once and starts the rest in arrival order', async () => {
    const semaphore = new Semaphore(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const jobs = gates.map((gate, i) =>
      semaphore.run(async () => {
        started.push(i);
        await gate.promise;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(semaphore.running).toBe(2);
    expect(semaphore.queued).toBe(1);
    gates[0]?.resolve();
    await jobs[0];
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1]?.resolve();
    gates[2]?.resolve();
    expect(await Promise.all(jobs)).toEqual([0, 1, 2]);
    expect(semaphore.running).toBe(0);
  });

  it('frees the slot when a job fails', async () => {
    const semaphore = new Semaphore(1);
    await expect(semaphore.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(semaphore.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(semaphore.running).toBe(0);
  });

  it('refuses a non-positive slot count', () => {
    expect(() => new Semaphore(0)).toThrow();
  });
});
