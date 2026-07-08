export async function safeOptionalUiLookup<T>(
  label: string,
  lookup: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await lookup();
  } catch (error) {
    console.warn(`Квестарня: необов'язкова підказка інтерфейсу не оновилась (${label}).`, error);
    return fallback;
  }
}
