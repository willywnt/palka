export function buildOAuthRedirectUrl(returnUrl: string, params: Record<string, string>) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = new URL(returnUrl, base);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
