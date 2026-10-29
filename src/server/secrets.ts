const SECRET_KEY = /token|authorization|secret|password|private_key|credential/i;

export function stripSecrets<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = walk(inner);
    }
    return out;
  }
  if (typeof value === 'string' && value.includes('pk_')) return '';
  return value;
}

/** Log lines for a migration. Never include secret values. */
export function safeLogLine(line: string): string {
  return line.replace(/pk_[A-Za-z0-9_]+/g, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}
