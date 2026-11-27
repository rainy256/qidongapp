import {ApiError, apiRequest, type Snapshot} from './types';
import {STATE_TIMEOUT_MS} from './http';

const primary = 'https://qidong.apexdaishi.xyz/app-api';
const direct = 'https://qidongapp.apexdaishi.xyz';

// Both production routes reach the same Worker and D1 database. Only a state
// read may use the second route. Never replay a user action or a login.
export async function readSquadState(base: string, token: string, signal: AbortSignal): Promise<Snapshot> {
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
      let failures = 0;
      requests.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
      function startBackup() {
        if (backupStarted || requests.signal.aborted) return;
        backupStarted = true;
        void read(direct);
      }
      async function read(origin: string) {
        try {
          const snapshot = await apiRequest<Snapshot>(origin, '/api/state', token, undefined, requests.signal);
          resolve(snapshot);
        } catch (error) {
          if (requests.signal.aborted) return;
          if (error instanceof ApiError && error.status < 500 && error.status !== 408) {
            reject(error);
            return;
          }
          if (++failures === 2) reject(error);
          else startBackup();
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
