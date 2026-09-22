export function inviteUrl(token) { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('invite', token); return url.toString(); }
export function isInviteToken(token) { return /^[a-f0-9]{48}$/.test(token || ''); }
