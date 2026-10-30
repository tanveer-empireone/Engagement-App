/** Keep mounted sessions current, including after returning to a suspended tab. */
export function subscribeServerState<T>(
  apply: (state: T, initial: boolean) => void,
  onError: (error: unknown) => void,
  events: EventTarget = window,
  visibility: EventTarget = document,
  intervalMs = 5000
): () => void {
  let stopped = false;
  let initial = true;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const refresh = async () => {
    clearTimeout(timer);
    controller?.abort();
    const request = new AbortController();
    controller = request;
    try {
      const response = await fetch('/api/state', { cache: 'no-store', signal: request.signal });
      if (!response.ok) throw new Error(`Could not refresh settings (HTTP ${response.status}).`);
      const state = await response.json();
      if (stopped || request.signal.aborted) return;
      apply(state, initial);
      initial = false;
    } catch (error) {
      if (!stopped && !request.signal.aborted) onError(error);
    } finally {
      if (!stopped && !request.signal.aborted) timer = setTimeout(refresh, intervalMs);
    }
  };
  const onRefresh = () => { void refresh(); };
  events.addEventListener('focus', onRefresh);
  events.addEventListener('online', onRefresh);
  events.addEventListener('app-settings-saved', onRefresh);
  visibility.addEventListener('visibilitychange', onRefresh);
  void refresh();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    events.removeEventListener('focus', onRefresh);
    events.removeEventListener('online', onRefresh);
    events.removeEventListener('app-settings-saved', onRefresh);
    visibility.removeEventListener('visibilitychange', onRefresh);
  };
}

export async function saveServerSettings<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || `Save failed (HTTP ${response.status}).`);
  }
  return data;
}
