import { z } from 'zod';

// GitHub PAT / fine-grained / Actions token — acceptent `ghp_`, `github_pat_`,
// et tokens classiques (40 hex chars). Regex défensive : min 20 chars, charset
// limité ASCII alphanumeric + quelques séparateurs. Pas d'espaces / \n.
const tokenRegex = /^[a-zA-Z0-9_-]{20,200}$/;

export const setGithubTokenInputSchema = z.object({
  organizationId: z.string().uuid(),
  token: z.string().regex(tokenRegex, 'GitHub token format invalide'),
});

export type SetGithubTokenInput = z.input<typeof setGithubTokenInputSchema>;

// Repo GitHub : `owner/repo` ou URL complète
const repoPathRegex = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;

export function parseRepoRef(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  // URL complète github.com/owner/repo
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/)?$/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  // owner/repo
  if (repoPathRegex.test(trimmed)) {
    const [owner, repo] = trimmed.split('/');
    return { owner, repo };
  }
  return null;
}

export const createGithubDeliverableSchema = z.object({
  projectId: z.string().uuid(),
  version: z.string().regex(/^\d{1,4}\.\d{1,4}(\.\d{1,4})?$/),
  githubUrl: z.string().min(1).max(500),
  githubBranch: z.string().max(100).default('main'),
  markAsLatest: z.boolean().default(false),
});

export type CreateGithubDeliverableInput = z.input<typeof createGithubDeliverableSchema>;
