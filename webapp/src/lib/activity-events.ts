export const activityEvents: Record<string, string> = {
  CREDENTIAL_REVEALED: 'API key accessed',
  ACCOUNT_CREATED: 'Account created',
  ACCOUNT_UPDATED: 'Account updated',
  ACCOUNT_DELETED: 'Account deleted',
  PASSWORD_RESET: 'Account password reset',
  LICENSE_ISSUED: 'License issued',
  LICENSE_RENEWED: 'License renewed',
  LICENSE_PLAN_CHANGED: 'License plan changed',
  LICENSE_TERMINATED: 'License terminated',
  REQUEST_APPROVED: 'Licenses issued from request',
};

export type ActivityPage = {
  items: { id: string; action: string; actorId: string; actorName: string; targetId: string | null; targetName: string; createdAt: string }[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
};
