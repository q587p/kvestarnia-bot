export interface PageNumberPrompt {
  label: string;
  totalPages: number;
}

const PAGE_NUMBER_PROMPT_PATTERN = /^Введіть номер сторінки для «(.+)» \(1-(\d{1,3})\):$/u;

export function presentPageNumberPrompt(label: string, totalPages: number): string {
  return `Введіть номер сторінки для «${label}» (1-${normalizeTotalPages(totalPages)}):`;
}

export function parsePageNumberPrompt(text: string | undefined): PageNumberPrompt | null {
  const match = text?.match(PAGE_NUMBER_PROMPT_PATTERN);
  if (!match) {
    return null;
  }

  const label = match[1];
  const totalPages = Number(match[2]);
  if (!label || !Number.isInteger(totalPages) || totalPages < 1) {
    return null;
  }

  return { label, totalPages };
}

export function parsePageNumber(text: string | undefined, totalPages: number): number | null {
  const value = text?.trim();

  if (!value || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  const page = Number(value);

  return page >= 1 && page <= normalizeTotalPages(totalPages) ? page : null;
}

export function getPageNumberPromptPlaceholder(totalPages: number): string {
  return `1-${normalizeTotalPages(totalPages)}`;
}

function normalizeTotalPages(totalPages: number): number {
  return Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
}
