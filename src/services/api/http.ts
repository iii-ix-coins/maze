export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Typed API helper for future feature-by-feature migration.
 * Existing polling/fetch loops are deliberately not routed through this helper
 * yet, so request headers, cadence, retry behaviour and payload handling stay
 * byte-for-byte under the current legacy feature modules.
 */
export async function apiRequest<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
