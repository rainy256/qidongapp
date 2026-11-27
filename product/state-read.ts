import {ApiError, apiRequest, type Snapshot} from './types';
import {STATE_TIMEOUT_MS} from './http';

const primary = 'https://qidong.apexdaishi.xyz/app-api';
const direct = 'https://qidongapp.apexdaishi.xyz';

// Both production routes reach the same Worker and D1 database. Only a state
// read may use the second route. Never replay a user action or a login.
export async function readSquadState(base: string, token: string, signal: AbortSignal, onBackup?: () => void): Promise<Snapshot> {
  if (base !== primary) return apiRequest<Snapshot>(base, '/api/state', token, undefined, signal);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const requests = new AbortController();
  const abort = () => requests.abort();
  signal.addEventListener('abort', abort, {once:true});
  const deadline = setTimeout(abort, STATE_TIMEOUT_MS);
  let backupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Snapshot>((resolve, reject) => {
      let backupStarted = false;
      let primaryFailure: {error: unknown} | undefined;
      let backupFailure: {error: unknown} | undefined;
      requests.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
      function startBackup() {
        if (backupStarted || requests.signal.aborted) return;
        backupStarted = true;
        onBackup?.();
        void read(direct);
      }
      async function read(origin: string) {
        try {
          const snapshot = await apiRequest<Snapshot>(origin, '/api/state', token, undefined, requests.signal);
          if (!requests.signal.aborted) resolve(snapshot);
        } catch (error) {
          if (requests.signal.aborted) return;
          // The Worker reports invalid/expired sessions as 401 + unauthorized.
          // Other HTTP errors may be specific to a route, not the session.
          if (error instanceof ApiError && error.status === 401 && error.code === 'unauthorized') {
            reject(error);
            return;
          }
          if (origin === primary) primaryFailure = {error};
          else backupFailure = {error};
          if (primaryFailure && backupFailure) {
            // Report the primary failure consistently, regardless of finish order.
            const failure = primaryFailure.error;
            // The refresh caller logs out on any ApiError 401. Do not let an
            // unrecognized upstream 401 invalidate a valid local session.
            reject(failure instanceof ApiError && failure.status === 401
              ? new Error('Unrecognized state route authentication response', {cause: failure})
              : failure);
          } else if (origin === primary) {
            startBackup();
          }
        }
      }
      backupTimer = setTimeout(startBackup, 4500);
      void read(primary);
    });
  } finally {
    clearTimeout(backupTimer);
    clearTimeout(deadline);
    signal.removeEventListener('abort', abort);
    requests.abort();
  }
}
