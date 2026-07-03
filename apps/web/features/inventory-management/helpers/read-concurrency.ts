export const PRISMA_READ_CONCURRENCY_LIMIT = 3;

type TaskResults<Tasks extends readonly (() => Promise<unknown>)[]> = {
  [Index in keyof Tasks]: Tasks[Index] extends () => Promise<infer Result>
    ? Awaited<Result>
    : never;
};

export async function runWithConcurrencyLimit<
  Tasks extends readonly (() => Promise<unknown>)[],
>(limit: number, tasks: Tasks): Promise<TaskResults<Tasks>> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Concurrency limit must be at least 1");
  }

  const results = new Array(tasks.length) as unknown as TaskResults<Tasks>;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const task = tasks[currentIndex];
      (results as unknown[])[currentIndex] = await task();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );

  return results;
}
