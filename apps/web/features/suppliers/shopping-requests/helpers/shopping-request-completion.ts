export async function finishShoppingRequest(
  action: () => Promise<unknown>,
  close: () => void,
): Promise<void> {
  await action();
  close();
}
