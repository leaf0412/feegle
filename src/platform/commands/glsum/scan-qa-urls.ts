const URL_PATTERN = /https?:\/\/[^\s)]+/g;

const QA_DOMAIN_PATTERNS = [
  /project\.feishu\.cn/,
  /meego\.feishu/,
];

export function scanQaUrls(text: string): string[] {
  const urls = text.match(URL_PATTERN) ?? [];
  return [...new Set(urls.filter((url) => isQaUrl(url)))];
}

function isQaUrl(url: string): boolean {
  return QA_DOMAIN_PATTERNS.some((pattern) => pattern.test(url));
}

export function extractAllUrls(text: string): string[] {
  const urls = text.match(URL_PATTERN) ?? [];
  return [...new Set(urls)];
}
