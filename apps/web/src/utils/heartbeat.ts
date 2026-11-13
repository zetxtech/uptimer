/** Absolute ping URL a heartbeat monitor's job should call. */
export function heartbeatPingUrl(token: string | null): string {
  if (!token) return '-';
  const base = typeof window === 'undefined' ? '' : `${window.location.origin}/api/v1`;
  return `${base}/heartbeat/${token}`;
}
