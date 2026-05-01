// ──────────────────────────────────────────────
// Simple structured logger
// Can be replaced with pino/winston later
// ──────────────────────────────────────────────

const timestamp = (): string => new Date().toISOString();

const formatMeta = (args: unknown[]): string => {
  if (args.length === 0) return '';
  return ' ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
};

export const logger = {
  info(message: string, ...args: unknown[]) {
    console.log(`[${timestamp()}] ℹ️  INFO  ${message}${formatMeta(args)}`);
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(`[${timestamp()}] ⚠️  WARN  ${message}${formatMeta(args)}`);
  },
  error(message: string, ...args: unknown[]) {
    console.error(`[${timestamp()}] ❌ ERROR ${message}${formatMeta(args)}`);
  },
  debug(message: string, ...args: unknown[]) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${timestamp()}] 🐛 DEBUG ${message}${formatMeta(args)}`);
    }
  },
};
