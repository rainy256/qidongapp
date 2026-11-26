import { useCallback, useEffect, useState } from 'react';
import { HttpSseRoomClient } from './api/httpSseClient';
import { mockRoomClient, type DemoControlState } from './api/mockClient';
import type { RoomRepository } from './api/repository';
import { DemoToolbar } from './components/DemoToolbar';
import type { RoomSnapshot } from './domain/types';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { RoomPage } from './pages/RoomPage';

const cloudflare = import.meta.env.MODE === 'cloudflare';
const useMock = !cloudflare && (import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.MODE === 'mock');
const httpRoomClient = new HttpSseRoomClient('/api', cloudflare ? 'poll' : 'sse', true);
const activeRepository: RoomRepository = useMock ? mockRoomClient : httpRoomClient;

type RouteState = Readonly<{
  pathname: string;
  search: string;
}>;

function readLocation(): RouteState {
  if (typeof window === 'undefined') {
    return { pathname: useMock ? '/r/demo-almost' : '/', search: '' };
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

export function App() {
  const [route, setRoute] = useState<RouteState>(readLocation);
  const [controls, setControls] = useState<DemoControlState>(() =>
    mockRoomClient.getControlState(),
  );
  const [activeSnapshot, setActiveSnapshot] = useState<RoomSnapshot | null>(null);

  useEffect(() => {
    if (!useMock) return;
    return mockRoomClient.subscribeControls(() => {
      setControls(mockRoomClient.getControlState());
    });
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    const targetUrl = new URL(to, window.location.origin);
    window.history.pushState({}, '', `${targetUrl.pathname}${targetUrl.search}`);
    setRoute({ pathname: targetUrl.pathname, search: targetUrl.search });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const roomMatch = /^\/r\/([^/]+)\/?$/.exec(route.pathname);
  const roomId = roomMatch ? decodeURIComponent(roomMatch[1]) : null;
  const justCreated = new URLSearchParams(route.search).get('created') === '1';

  return (
    <>
      {roomId ? (
        <RoomPage
          key={roomId}
          roomId={roomId}
          justCreated={justCreated}
          repository={activeRepository}
          storageScope={useMock ? 'mock' : 'prod'}
          denyClipboard={useMock ? controls.denyClipboard : false}
          onNavigate={navigate}
          onRoomLoaded={setActiveSnapshot}
        />
      ) : (
        <CreateRoomPage
          repository={activeRepository}
          storageScope={useMock ? 'mock' : 'prod'}
          showDemoLink={useMock}
          denyClipboard={useMock ? controls.denyClipboard : false}
          onCreated={(newId) => navigate(`/r/${encodeURIComponent(newId)}?created=1`)}
          onNavigate={navigate}
        />
      )}

      {useMock && (
        <DemoToolbar
          currentPath={route.pathname}
          activeRoomId={roomId}
          currentDurationSlots={activeSnapshot?.durationSlots}
          onNavigate={navigate}
        />
      )}
    </>
  );
}

export default App;
