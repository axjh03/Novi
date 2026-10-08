import { AccessError } from './access-policy';

export const GITHUB_REPO = 'axjh03/Novi';

function getGitHubToken(): string {
  const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new AccessError('GITHUB_PAT is not configured in .env', 500);
  }
  return token.trim();
}

export async function githubFetch(endpoint: string, options: RequestInit = {}) {
  const token = getGitHubToken();
  const url = endpoint.startsWith('https://') ? endpoint : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Novi-Admin-Portal',
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  return res;
}

