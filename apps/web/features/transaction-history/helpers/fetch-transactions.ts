/**
 * Run the count and findMany queries that back `GET /api/transactions` in
 * parallel.
 *
 * The route used to await them serially, paying full latency twice. They are
 * fully independent so `Promise.all` halves the wall-clock time of every
 * history poll the cashier triggers.
 */
export async function fetchTransactionsAndCount<TItem>(args: {
  count: () => Promise<number>;
  findMany: () => Promise<TItem[]>;
}): Promise<{ items: TItem[]; total: number }> {
  const [total, items] = await Promise.all([args.count(), args.findMany()]);
  return { items, total };
}
