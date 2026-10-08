import { AccessError } from './access-policy';
import { GITHUB_REPO, githubFetch } from './github';

export interface ActionArtifact {
  id: number;
  name: string;
  size: number;
  createdAt: string;
}

function githubError(status: number) {
  if (status === 401 || status === 403) return `GitHub denied access (${status}). Check the saved PAT has Actions read/write permission for ${GITHUB_REPO}, and check GitHub rate limits.`;
  if (status === 404) return 'GitHub could not find the artifact or repository. Refresh the list and check PAT repository access.';
  return `GitHub artifact request failed (${status}). Try again later.`;
}

export async function listArtifacts(page: number) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AccessError('Invalid artifact page.', 400);
  const response = await githubFetch(`/repos/${GITHUB_REPO}/actions/artifacts?per_page=100&page=${page}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new AccessError(githubError(response.status), 502);
  const data = await response.json();
  const artifacts: ActionArtifact[] = data.artifacts.map((artifact: { id: number; name: string; size_in_bytes: number; created_at: string }) => ({
    id: artifact.id, name: artifact.name, size: artifact.size_in_bytes, createdAt: artifact.created_at,
  }));
  return { repo: GITHUB_REPO, artifacts, hasNext: /rel="next"/.test(response.headers.get('link') || '') };
}

export async function deleteArtifacts(body: Record<string, unknown>) {
  const ids = body.ids;
  if (body.confirm !== 'delete-artifacts' || !Array.isArray(ids) || ids.length < 1 || ids.length > 5 ||
      ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new AccessError('Confirm deletion with 1–5 unique artifact IDs.', 400);
  }
  // Delete only the reviewed IDs; artifacts uploaded during cleanup are untouched.
  const results = await Promise.all(ids.map(async (id: number) => {
    try {
      const response = await githubFetch(`/repos/${GITHUB_REPO}/actions/artifacts/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
      return { id, deleted: response.status === 204, error: response.status === 204 ? null : githubError(response.status) };
    } catch {
      return { id, deleted: false, error: 'Deletion could not be confirmed. Refresh the list before retrying.' };
    }
  }));
  return { results };
}
