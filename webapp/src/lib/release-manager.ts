import { AccessError } from './access-policy';
import { authenticate } from './access';

const GITHUB_REPO = 'axjh03/Novi';

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  html_url: string;
}

function bumpPatch(version: string): string {
  const parts = version.replace(/^v/, '').split('.');
  if (parts.length === 3) {
    const patch = parseInt(parts[2], 10);
    if (!Number.isNaN(patch)) {
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
  }
  return '0.1.2';
}

function getGitHubToken(): string {
  const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new AccessError('GITHUB_PAT is not configured in .env', 500);
  }
  return token.trim();
}

async function githubFetch(endpoint: string, options: RequestInit = {}) {
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

export async function getReleaseStatus(req: Request) {
  const { account } = await authenticate(req);
  if (account.role !== 'ADMIN') {
    throw new AccessError('Administrator access required.', 403);
  }

  // 1. Get latest tag / release
  let latestTag = 'v0.1.1';
  let releaseDate = '';
  let releaseName = '';

  const relRes = await githubFetch(`/repos/${GITHUB_REPO}/releases/latest`);
  if (relRes.ok) {
    const relData = await relRes.json();
    latestTag = relData.tag_name || 'v0.1.1';
    releaseDate = relData.published_at || relData.created_at || '';
    releaseName = relData.name || latestTag;
  } else {
    // Fall back to tags list
    const tagsRes = await githubFetch(`/repos/${GITHUB_REPO}/tags?per_page=1`);
    if (tagsRes.ok) {
      const tags = await tagsRes.json();
      if (tags && tags.length > 0) {
        latestTag = tags[0].name;
      }
    }
  }

  const currentVersion = latestTag.replace(/^v/, '');
  const nextSuggestedVersion = bumpPatch(currentVersion);

  // 2. Compare latest tag with main branch
  let isOutdated = false;
  let commitsAhead = 0;
  let commitsList: Array<{ sha: string; message: string; author: string; date: string; url: string }> = [];

  const compRes = await githubFetch(`/repos/${GITHUB_REPO}/compare/${latestTag}...main`);
  if (compRes.ok) {
    const compData = await compRes.json();
    commitsAhead = compData.ahead_by || 0;
    isOutdated = commitsAhead > 0;
    if (Array.isArray(compData.commits)) {
      commitsList = compData.commits.map((c: GitHubCommit) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      })).reverse(); // latest first
    }
  }

  // 3. Get latest workflow run
  let latestRun: any = null;
  const runsRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs?per_page=3`);
  if (runsRes.ok) {
    const runsData = await runsRes.json();
    if (Array.isArray(runsData.workflow_runs) && runsData.workflow_runs.length > 0) {
      const run = runsData.workflow_runs[0];
      latestRun = {
        id: run.id,
        name: run.name,
        status: run.status, // "queued" | "in_progress" | "completed"
        conclusion: run.conclusion, // "success" | "failure" | "cancelled" | null
        htmlUrl: run.html_url,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        runNumber: run.run_number,
        headBranch: run.head_branch,
      };
    }
  }

  return {
    repo: GITHUB_REPO,
    currentTag: latestTag,
    currentVersion,
    releaseDate,
    releaseName,
    nextSuggestedVersion,
    isOutdated,
    commitsAhead,
    commits: commitsList,
    latestRun,
    configured: true,
  };
}

export async function triggerRelease(req: Request, body: Record<string, unknown>) {
  const { account } = await authenticate(req);
  if (account.role !== 'ADMIN') {
    throw new AccessError('Administrator access required.', 403);
  }

  const rawVersion = typeof body.version === 'string' ? body.version.trim().replace(/^v/, '') : '';
  if (!rawVersion || !/^\d+\.\d+\.\d+$/.test(rawVersion)) {
    throw new AccessError('Invalid SemVer format. Example: 0.1.2', 400);
  }

  const tagName = `v${rawVersion}`;
  const releaseNotes = typeof body.releaseNotes === 'string' && body.releaseNotes.trim()
    ? body.releaseNotes.trim()
    : `Release ${tagName}`;

  // 1. Get SHA of main branch head
  const refRes = await githubFetch(`/repos/${GITHUB_REPO}/git/ref/heads/main`);
  if (!refRes.ok) {
    const err = await refRes.text();
    throw new AccessError(`Failed to fetch main branch ref from GitHub: ${err}`, 500);
  }
  const refData = await refRes.json();
  const mainSha = refData?.object?.sha;
  if (!mainSha) {
    throw new AccessError('Could not determine HEAD SHA of main branch.', 500);
  }

  // 2. Create the git tag on GitHub (triggers push: tags: 'v*')
  let tagCreated = false;
  const tagRes = await githubFetch(`/repos/${GITHUB_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/tags/${tagName}`,
      sha: mainSha,
    }),
  });

  if (tagRes.ok) {
    tagCreated = true;
  } else if (tagRes.status === 422) {
    // Tag might already exist
    tagCreated = true;
  } else {
    const err = await tagRes.text();
    console.warn('Could not create tag via git/refs API:', err);
  }

  // 3. Also trigger workflow_dispatch on build.yml as explicit dispatch
  const dispatchRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        tag_name: tagName,
        release_notes: releaseNotes,
      },
    }),
  });

  const dispatchOk = dispatchRes.ok;

  return {
    success: true,
    tag: tagName,
    version: rawVersion,
    tagCreated,
    workflowDispatched: dispatchOk,
    message: `Release ${tagName} triggered! GitHub Actions is building installers for macOS, Windows, and Linux.`,
    actionsUrl: `https://github.com/${GITHUB_REPO}/actions`,
  };
}
