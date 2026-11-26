export function nativeLinkForPath(path: string): string | null;
export function parseNativeLaunch(raw: string): {kind:'invite'; id:string} | {kind:'page';page:'schedule'|'messages'|'me'} | null;
