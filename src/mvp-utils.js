export function inviteUrl(token, href = location.href) { const url = new URL('./', href); url.search = ''; url.hash = ''; url.searchParams.set('invite', token); return url.toString(); }
export function isGuestRoute(search) { return new URLSearchParams(search).has('invite'); }
export function isInviteToken(token) { return /^[a-f0-9]{48}$/.test(token || ''); }
