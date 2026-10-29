/** Fail closed when a required integration is not configured. */
export class ServiceUnavailableError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
