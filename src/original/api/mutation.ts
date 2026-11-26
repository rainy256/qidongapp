// A pending mutation represents one intent, not one network request.
export type PendingMutation = { fingerprint: string; key: string; baseRevision: number };
export function mutationKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
}
export function pendingMutation(previous: PendingMutation | null, input: unknown, baseRevision=0): PendingMutation {
  const fingerprint=JSON.stringify(input);
  return previous?.fingerprint===fingerprint ? previous : {fingerprint,key:mutationKey(),baseRevision};
}
export function readPending(scope: string): PendingMutation | null {
  try {
    const v=JSON.parse(sessionStorage.getItem('qidong:pending:'+scope)||'null') as PendingMutation|null;
    return v && typeof v.fingerprint==='string' && /^[a-f0-9]{32}$/.test(v.key) &&
      Number.isSafeInteger(v.baseRevision) && v.baseRevision>=0 ? v : null;
  } catch { return null; }
}
export function writePending(scope: string, value: PendingMutation | null): void {
  try {
    if(value) sessionStorage.setItem('qidong:pending:'+scope,JSON.stringify(value));
    else sessionStorage.removeItem('qidong:pending:'+scope);
  } catch { /* private WebViews may block storage; component refs still protect retries */ }
}
