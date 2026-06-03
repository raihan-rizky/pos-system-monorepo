export interface BlockingErrorItem {
  key: string;
  message: string;
}

export function buildBlockingErrorItems(errors: string[]): BlockingErrorItem[] {
  return errors.map((message, index) => ({
    key: `${index}:${message}`,
    message,
  }));
}
