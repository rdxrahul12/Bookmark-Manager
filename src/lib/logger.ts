// Logger is the one place we're allowed to call console directly — every other
// caller goes through these wrappers so we can no-op them in production.
/* eslint-disable no-console */
import { isDev } from "./env";

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => undefined;

export const logger = {
  debug: (isDev ? console.debug.bind(console) : noop) as LogFn,
  info: (isDev ? console.info.bind(console) : noop) as LogFn,
  warn: console.warn.bind(console) as LogFn,
  error: console.error.bind(console) as LogFn,
};
