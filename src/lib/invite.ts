const KEY = 'pendingInviteToken'

export function storePendingInvite(token: string): void {
  sessionStorage.setItem(KEY, token)
}

export function consumePendingInvite(): string | null {
  const token = sessionStorage.getItem(KEY)
  if (token) sessionStorage.removeItem(KEY)
  return token
}
