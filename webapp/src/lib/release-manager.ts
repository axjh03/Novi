import { AccessError } from './access-policy';
import { authenticate } from './access';
import { GITHUB_REPO, githubFetch } from './github';
import { listArtifacts, deleteArtifacts } from './github-artifacts';

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

export interface SemVerOptions {
  current: string;
  nextPatch: string;
  nextMinor: string;
  nextMajor: string;
  defaultNext: string;
}

export function computeSemVerOptions(rawVersion: string): SemVerOptions {
  const clean = rawVersion.replace(/^v/, '').trim();
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return {
      current: clean || '0.1.2',
      nextPatch: '0.1.3',
      nextMinor: '0.2.0',
      nextMajor: '1.0.0',
      defaultNext: '0.1.3',
    };
  }
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);

  const nextPatch = `${major}.${minor}.${patch + 1}`;
  const nextMinor = `${major}.${minor + 1}.0`;
  const nextMajor = `${major + 1}.0.0`;

  return {
    current: clean,
    nextPatch,
    nextMinor,
    nextMajor,
    defaultNext: nextPatch,
  };
}

export interface WorkflowJobSummary {
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | null
  startedAt: string | null;
  completedAt: string | null;
}

export interface ReleaseAssetSummary {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  browserDownloadUrl: string;
  apiUrl: string;
}

export async function getReleaseStatus(req: Request) {
  const { account } = await authenticate(req);
  if (account.role !== 'ADMIN') {
    throw new AccessError('Administrator access required.', 403);
  }

  // 1. Get latest tag / release
  let latestTag = 'v0.1.2';
  let releaseDate = '';
  let releaseName = '';
  let releaseBody = '';
  let releaseAssets: ReleaseAssetSummary[] = [];

  const relRes = await githubFetch(`/repos/${GITHUB_REPO}/releases/latest`);
  if (relRes.ok) {
    const relData = await relRes.json();
    latestTag = relData.tag_name || 'v0.1.2';
    releaseDate = relData.published_at || relData.created_at || '';
    releaseName = relData.name || latestTag;
    releaseBody = relData.body || '';
    if (Array.isArray(relData.assets)) {
      releaseAssets = relData.assets.map((a: any) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        downloadCount: a.download_count,
        browserDownloadUrl: a.browser_download_url,
        apiUrl: a.url,
      }));
    }
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

  const semver = computeSemVerOptions(latestTag);

  // 2. Compare latest tag with main branch
  let commitsAhead = 0;
  let commitsList: Array<{ sha: string; message: string; author: string; date: string; url: string }> = [];

  const compRes = await githubFetch(`/repos/${GITHUB_REPO}/compare/${latestTag}...main`);
  if (compRes.ok) {
    const compData = await compRes.json();
    commitsAhead = compData.ahead_by || 0;
    if (Array.isArray(compData.commits)) {
      commitsList = compData.commits.map((c: GitHubCommit) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      })).reverse(); // newest first
    }
  }

  // 3. Get latest workflow run and its individual runner jobs
  let latestRun: any = null;
  let jobs: WorkflowJobSummary[] = [];

  const runsRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs?per_page=5`);
  if (runsRes.ok) {
    const runsData = await runsRes.json();
    if (Array.isArray(runsData.workflow_runs) && runsData.workflow_runs.length > 0) {
      // Find the latest run matching build workflow
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

      // Fetch jobs for this run
      try {
        const jobsRes = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs/${run.id}/jobs`);
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          if (Array.isArray(jobsData.jobs)) {
            jobs = jobsData.jobs.map((j: any) => ({
              name: j.name,
              status: j.status,
              conclusion: j.conclusion,
              startedAt: j.started_at,
              completedAt: j.completed_at,
            }));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch job breakdown:', err);
      }
    }
  }

  // 4. Calculate accurate health state without false positives
  // State: 'BUILDING' | 'FAILED' | 'OUTDATED' | 'UP_TO_DATE'
  let state: 'BUILDING' | 'FAILED' | 'OUTDATED' | 'UP_TO_DATE' = 'UP_TO_DATE';
  let stateReason = '';

  const isBuilding = latestRun && (latestRun.status === 'queued' || latestRun.status === 'in_progress');
  const isFailed = latestRun && latestRun.status === 'completed' && latestRun.conclusion !== 'success';
  const hasPendingCommits = commitsAhead > 0;

  if (isBuilding) {
    state = 'BUILDING';
    stateReason = `GitHub Actions is currently building ${latestRun.headBranch || 'latest tag'} (Run #${latestRun.runNumber}).`;
  } else if (isFailed) {
    state = 'FAILED';
    const failedJob = jobs.find(j => j.conclusion === 'failure');
    stateReason = failedJob
      ? `Build failed on runner: ${failedJob.name}. Installers were not published.`
      : `Latest CI/CD run failed with conclusion: ${latestRun.conclusion}.`;
  } else if (hasPendingCommits) {
    state = 'OUTDATED';
    stateReason = `${commitsAhead} new ${commitsAhead === 1 ? 'commit' : 'commits'} pushed to main since ${latestTag}.`;
  } else {
    // Only UP_TO_DATE if latest run succeeded and assets exist
    const hasBinaries = releaseAssets.some(a => a.name.endsWith('.dmg') || a.name.endsWith('.exe') || a.name.endsWith('.deb'));
    if (latestRun && latestRun.conclusion === 'success' && hasBinaries) {
      state = 'UP_TO_DATE';
      stateReason = `All desktop installers for ${latestTag} are built and verified with zero pending commits.`;
    } else if (!hasBinaries) {
      state = 'OUTDATED';
      stateReason = `Release ${latestTag} does not have completed binary installers attached yet.`;
    } else {
      state = 'UP_TO_DATE';
      stateReason = `Desktop releases are up to date on ${latestTag}.`;
    }
  }

  return {
    repo: GITHUB_REPO,
    currentTag: latestTag,
    currentVersion: semver.current,
    semver,
    nextSuggestedVersion: semver.defaultNext,
    releaseDate,
    releaseName,
    releaseBody,
    releaseAssets,
    state,
    stateReason,
    isOutdated: state === 'OUTDATED' || state === 'FAILED',
    commitsAhead,
    commits: commitsList,
    latestRun,
    jobs,
    configured: true,
  };
}

export async function triggerRelease(req: Request, body: Record<string, unknown>) {
  const { account } = await authenticate(req);
  if (account.role !== 'ADMIN') {
    throw new AccessError('Administrator access required.', 403);
  }

  const rawVersion = typeof body.version === 'string' ? body.version.trim().replace(/^v/, '') : '';
  if (!rawVersion || !/^\d+\.\d+\.\d+.*$/.test(rawVersion)) {
    throw new AccessError('Invalid SemVer format. Example: 0.1.3', 400);
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

  // 2. Create the git tag on GitHub (this triggers push: tags: 'v*')
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
    // Tag already exists; fall back to workflow_dispatch
    tagCreated = true;
    await githubFetch(`/repos/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`, {
      method: 'POST',
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          tag_name: tagName,
          release_notes: releaseNotes,
        },
      }),
    });
  } else {
    const err = await tagRes.text();
    console.warn('Could not create tag via git/refs API:', err);
    // Try dispatch
    await githubFetch(`/repos/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`, {
      method: 'POST',
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          tag_name: tagName,
          release_notes: releaseNotes,
        },
      }),
    });
  }

  return {
    success: true,
    tag: tagName,
    version: rawVersion,
    tagCreated,
    message: `Release ${tagName} triggered! GitHub Actions is building installers sequentially for macOS, Windows, and Linux.`,
    actionsUrl: `https://github.com/${GITHUB_REPO}/actions`,
  };
}

export async function manageReleaseArtifacts(req: Request, body: Record<string, unknown>) {
  const { account, session } = await authenticate(req);
  if (account.role !== 'ADMIN' || session.audience !== 'portal') {
    throw new AccessError('Administrator portal access required.', 403);
  }
  if (req.method === 'GET') {
    const page = Number(new URL(req.url).searchParams.get('page') || '1');
    return listArtifacts(page);
  }
  if (req.method === 'DELETE') return deleteArtifacts(body);
  throw new AccessError('Method not allowed.', 405);
}
