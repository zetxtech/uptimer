export type BulkMonitorFailure = { id: number; error: unknown };

export type BulkMonitorResult = {
  succeeded: number[];
  failed: BulkMonitorFailure[];
};

export async function runBulkMonitorOperation(
  monitorIds: readonly number[],
  operation: (id: number) => Promise<unknown>,
  concurrency = 4,
): Promise<BulkMonitorResult> {
  const ids = [...new Set(monitorIds)];
  const results: Array<{ ok: true } | { ok: false; error: unknown }> = new Array(ids.length);
  let nextIndex = 0;
  const workerCount = Math.min(ids.length, Math.max(1, Math.floor(concurrency) || 1));

  async function worker(): Promise<void> {
    while (nextIndex < ids.length) {
      const index = nextIndex++;
      const id = ids[index]!;
      try {
        await operation(id);
        results[index] = { ok: true };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const succeeded: number[] = [];
  const failed: BulkMonitorFailure[] = [];
  ids.forEach((id, index) => {
    const result = results[index]!;
    if (result.ok) succeeded.push(id);
    else failed.push({ id, error: result.error });
  });
  return { succeeded, failed };
}
