import { useMemo } from 'react';
import { Bell, CalendarClock, Gamepad2, Megaphone } from 'lucide-react';
import {
  REPLY_LABELS,
  formatTimestamp,
  type Snapshot,
  type WriteFn,
} from '../types';

type MessagesViewProps = Readonly<{
  snap: Snapshot;
  write: WriteFn;
  onJumpInvite: (inviteId: string) => void;
  onJumpReservation: (reservationId: string) => void;
}>;

type TimelineItem =
  | {
      key: string;
      createdAt: number;
      unread: boolean;
      category: 'invite' | 'assembled' | 'reply';
      title: string;
      subtitle: string;
      onOpen: () => void;
    }
  | {
      key: string;
      createdAt: number;
      unread: boolean;
      category: 'reservation';
      title: string;
      subtitle: string;
      onOpen: () => void;
    }
  | {
      key: string;
      createdAt: number;
      unread: boolean;
      category: 'nudge';
      title: string;
      subtitle: string;
      onOpen: () => void;
    };

export function MessagesView({ snap, write, onJumpInvite, onJumpReservation }: MessagesViewProps) {
  const items = useMemo<TimelineItem[]>(() => {
    const memberName = (id: string) => snap.members.find((x) => x.id === id)?.nickname || '队友';

    const inviteMsgs: TimelineItem[] = snap.messages.map((m) => ({
      key: `msg-${m.id}`,
      createdAt: m.created_at,
      unread: !m.read_at,
      category: m.kind,
      title:
        m.kind === 'invite' ? '开黑邀请' : m.kind === 'assembled' ? '集结成功' : '成员回复',
      subtitle: `${memberName(m.actor)} · ${
        m.kind === 'reply' ? REPLY_LABELS[m.detail] || m.detail : m.detail
      }`,
      onOpen: () => {
        if (!m.read_at) void write('/api/messages/read', { id: m.id });
        onJumpInvite(m.invite_id);
      },
    }));

    const resMsgs: TimelineItem[] = snap.reservationMessages.map((m) => ({
      key: `res-${m.id}`,
      createdAt: m.created_at,
      unread: !m.read_at,
      category: 'reservation',
      title: '预约动态',
      subtitle: m.detail,
      onOpen: () => {
        if (!m.read_at) void write('/api/reservation-messages/read', { id: m.id });
        onJumpReservation(m.reservation_id);
      },
    }));

    const nudgeMsgs: TimelineItem[] = snap.nudges.map((m) => ({
      key: `nudge-${m.id}`,
      createdAt: m.created_at,
      unread: false,
      category: 'nudge',
      title: '催促提醒',
      subtitle: m.detail,
      onOpen: () => {
        onJumpInvite(m.invite_id);
      },
    }));

    return [...inviteMsgs, ...resMsgs, ...nudgeMsgs].sort((a, b) => b.createdAt - a.createdAt);
  }, [snap.messages, snap.reservationMessages, snap.nudges, snap.members, write, onJumpInvite, onJumpReservation]);

  const unreadCount = items.filter((i) => i.unread).length;

  function renderIcon(cat: TimelineItem['category']) {
    if (cat === 'reservation') return <CalendarClock size={16} aria-hidden="true" />;
    if (cat === 'nudge') return <Megaphone size={16} aria-hidden="true" />;
    if (cat === 'assembled' || cat === 'invite') return <Gamepad2 size={16} aria-hidden="true" />;
    return <Bell size={16} aria-hidden="true" />;
  }

  return (
    <section className="paper">
      <div className="cardHeaderRow">
        <h2 className="sectionHeading">消息中心</h2>
        {unreadCount > 0 && <span className="badgeAccent tabular">{unreadCount} 条未读</span>}
      </div>

      {items.length === 0 ? (
        <div className="emptyStateInline">
          <p className="emptyStateTitle">暂时没有消息</p>
          <p className="helperText">有新的开黑邀请、队友回复或预约变更时会在这里按时间展示。</p>
        </div>
      ) : (
        <div className="messageList">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`msgCard ${item.unread ? 'isUnread' : ''}`}
              onClick={item.onOpen}
            >
              <div className="msgCardTop">
                <span className={`msgTag msgTag_${item.category}`}>
                  {renderIcon(item.category)}
                  <span>{item.title}</span>
                </span>
                <span className="msgTime tabular">
                  {item.unread && <span className="unreadDot" aria-label="未读" />}
                  {formatTimestamp(item.createdAt)}
                </span>
              </div>
              <p className="msgDetail">{item.subtitle}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
