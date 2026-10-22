"use client";

import { useCallback, useState } from "react";

/**
 * One idempotency key per user action (rule 8): reused if the same action is
 * retried (double click, network retry), renewed after it succeeds.
 */
export function useIdempotencyKey(): [string, () => void] {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return [key, renew];
}
