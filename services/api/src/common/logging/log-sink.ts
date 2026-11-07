export interface LogSink {
  write(entry: Record<string, unknown>): void;
}

export const LOG_SINK = Symbol('LOG_SINK');

/** Production sink: one JSON object per line on stdout. */
export const stdoutSink: LogSink = {
  write: (entry) => {
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  },
};
