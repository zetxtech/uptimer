/** Response details captured for the incident page's request tabs. */
export type CheckDetail = {
  effectiveUrl: string | null;
  redirectCount: number | null;
  responseHeaders: Record<string, string> | null;
  timings: Record<string, number> | null;
  resolvedIps: string[] | null;
};

export type CheckOutcome = {
  status: 'up' | 'down' | 'unknown';
  latencyMs: number | null;
  error: string | null;
  httpStatus: number | null;
  attempts: number;
  detail?: CheckDetail;
};
