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

/**
 * The portal's "Build & Release" button: starts the release workflow for a new version.
 *
 * Only an admin may do this. The version must be plain "x.y.z" (it becomes the tag v<version>), and
 * the tag must not exist yet. The release notes are what users read in Novi's Settings › Updates;
 * empty is allowed, and the workflow then uses release-notes/v<version>.md from the repository.
 */
export async function triggerRelease(req: Request, body: Record<string, unknown>) {
  const { account } = await authenticate(req);
  if (account.role !== 'ADMIN') {
    throw new AccessError('Administrator access required.', 403);
  }

  const rawVersion = typeof body.version === 'string' ? body.version.trim().replace(/^v/, '') : '';
  // Plain x.y.z only: the tag also names release-notes/<tag>.md inside the workflow.
  if (!/^\d+\.\d+\.\d+$/.test(rawVersion)) {
    throw new AccessError('Enter the version as three numbers, for example 4.0.25.', 400);
  }
  const releaseNotes = typeof body.releaseNotes === 'string' ? body.releaseNotes.trim().slice(0, 20_000) : '';
  return startReleaseBuild(rawVersion, releaseNotes);
}

/**
 * Starts the release workflow (.github/workflows/build.yml) for a version that has no tag yet.
 *
 * It uses workflow_dispatch with the tag name and the notes, instead of creating the tag first:
 * a tag created through the API starts the workflow without any notes, which is how releases used
 * to reach users with no notes at all. The workflow builds main, and its publish step creates the
 * tag at exactly the commit it built, only when macOS, Windows and Linux all succeeded.
 *
 * An existing tag is refused: building today's main into an older tag's release would publish
 * installers that don't match the tagged code. A failed release is retried with "Re-run failed
 * jobs" on its GitHub Actions run instead.
 *
 * @param version       the version, already checked to be x.y.z.
 * @param releaseNotes  plain-text notes for users, or '' to use release-notes/v<version>.md.
 * @throws AccessError when the tag exists or GitHub refuses or can't be reached.
 */
export async function startReleaseBuild(version: string, releaseNotes: string) {
  const tagName = `v${version}`;
  const existing = await githubFetch(`/repos/${GITHUB_REPO}/git/ref/tags/${tagName}`);
  if (existing.ok) {
    throw new AccessError(`${tagName} already exists. Choose a new version, or open its run on GitHub Actions and use "Re-run failed jobs" to retry it.`, 409);
  }
  if (existing.status !== 404) {
    throw new AccessError(`Could not check whether ${tagName} exists (GitHub answered ${existing.status}). Try again.`, 502);
  }

  const dispatch = await githubFetch(`/repos/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { tag_name: tagName, release_notes: releaseNotes } }),
  });
  if (!dispatch.ok) {
    const detail = await dispatch.text().catch(() => '');
    throw new AccessError(`GitHub did not start the release build (status ${dispatch.status}). ${detail.slice(0, 300)}`.trim(), 502);
  }

  return {
    success: true,
    tag: tagName,
    version,
    message: `Release ${tagName} started. GitHub Actions builds macOS, Windows and Linux one after another and publishes only when all three succeed.`,
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
