/**
 * Utilities for idempotent mutation operations.
 * Generates and caches idempotency keys so that retry operations preserve the key.
 */

export function generateIdempotencyKey(prefix = 'idem'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Action-scoped idempotency key manager.
 * Keeps the same key across retries of the same user action until explicitly cleared.
 */
export class ActionIdempotency {
  private keys: Map<string, string> = new Map();

  /**
   * Get or initialize an idempotency key for an action identifier (e.g. `submit-req-101`).
   */
  public getKey(actionId: string, prefix = 'idem'): string {
    let key = this.keys.get(actionId);
    if (!key) {
      key = generateIdempotencyKey(prefix);
      this.keys.set(actionId, key);
    }
    return key;
  }

  /**
   * Clear the key after successful mutation so future independent actions get a fresh key.
   */
  public clearKey(actionId: string): void {
    this.keys.delete(actionId);
  }
}

export const actionIdempotency = new ActionIdempotency();
