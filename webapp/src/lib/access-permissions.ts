export function canResetPassword(actorRole: string, targetRole: string) {
  return actorRole === 'ADMIN'
    || (actorRole === 'CORP' && ['SUBCORP', 'LICENSE'].includes(targetRole))
    || (actorRole === 'SUBCORP' && targetRole === 'LICENSE');
}
