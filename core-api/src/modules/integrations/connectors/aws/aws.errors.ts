/**
 * Raised when AWS public-exposure discovery cannot complete:
 * - a List/Describe/Get API call rejects after the SDK's own retries, or
 * - a pagination loop would exceed `MAX_PAGES_PER_LIST`.
 *
 * Lives in its own module — deliberately NOT in `aws.connector.ts` — so the
 * discovery module can throw it without importing the connector (which itself
 * imports discovery), avoiding a discovery → connector → discovery cycle.
 *
 * Budget exhaustion is NOT an error: discovery returns `{ truncated: true }`
 * with whatever candidates it collected so far.
 */
export class AwsSyncError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AwsSyncError';
  }
}
