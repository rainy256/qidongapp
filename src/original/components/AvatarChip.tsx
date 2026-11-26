import styles from './AvatarChip.module.css';

const PASTEL_PALETTE = [
  { bg: '#FFE7DC', bgTo: '#FFD2C6', ink: '#9B3A35', border: '#F8BDB0' },
  { bg: '#FFF3C9', bgTo: '#FFE59E', ink: '#854E08', border: '#F2CC6E' },
  { bg: '#E3F0FF', bgTo: '#CBE2FF', ink: '#295796', border: '#B2D2FA' },
  { bg: '#EFE8FF', bgTo: '#DDD2FF', ink: '#573CA3', border: '#C9B9FA' },
  { bg: '#FFE5F2', bgTo: '#FCCCE5', ink: '#963771', border: '#F2B4D6' },
  { bg: '#FFEBD4', bgTo: '#FFD8B0', ink: '#8E4B12', border: '#F5C18E' },
] as const;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getAvatarTone(seed: string) {
  return PASTEL_PALETTE[hashString(seed) % PASTEL_PALETTE.length];
}

export function getInitialChar(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed)[0];
}

type AvatarDotProps = Readonly<{
  name: string;
  seed: string;
  size?: 'sm' | 'md';
  isMe?: boolean;
}>;

export function AvatarDot({ name, seed, size = 'md', isMe = false }: AvatarDotProps) {
  const tone = getAvatarTone(seed || name);
  return (
    <span
      className={`${styles.dot} ${size === 'sm' ? styles.dotSm : styles.dotMd} ${
        isMe ? styles.dotMe : ''
      }`}
      style={{
        backgroundImage: `linear-gradient(145deg, ${tone.bg} 0%, ${tone.bgTo} 100%)`,
        color: tone.ink,
        borderColor: isMe ? 'var(--my-track-end)' : tone.border,
      }}
      aria-hidden="true"
    >
      {getInitialChar(name)}
    </span>
  );
}

export type SeatPlayer = Readonly<{
  id: string;
  name: string;
  isMe?: boolean;
}>;

type SeatRowProps = Readonly<{
  players: readonly SeatPlayer[];
  targetPlayers: number;
  onClickEmptySeat?: () => void;
}>;

export function SeatRow({ players, targetPlayers, onClickEmptySeat }: SeatRowProps) {
  const missing = Math.max(0, targetPlayers - players.length);
  const emptyCount = Math.min(missing, 2);
  const extraEmpty = missing - emptyCount;

  return (
    <div className={styles.seatRow} aria-label={`当前上车名单（${players.length}/${targetPlayers} 人）`}>
      {players.map((p) => (
        <span
          key={p.id}
          className={`${styles.playerChip} ${p.isMe ? styles.playerChipMe : ''}`}
        >
          <AvatarDot name={p.name} seed={p.id} size="sm" isMe={p.isMe} />
          <span className={styles.playerName}>{p.name}</span>
          {p.isMe && <span className={styles.meBadge}>我</span>}
        </span>
      ))}

      {Array.from({ length: emptyCount }).map((_, idx) =>
        onClickEmptySeat ? (
          <button
            key={`empty-${idx}`}
            type="button"
            className={styles.emptySeatBtn}
            onClick={onClickEmptySeat}
          >
            <span className={styles.emptyCircle} aria-hidden="true">
              +
            </span>
            <span>等你上车</span>
          </button>
        ) : (
          <span key={`empty-${idx}`} className={styles.emptySeat}>
            <span className={styles.emptyCircle} aria-hidden="true">
              ?
            </span>
            <span>等你</span>
          </span>
        ),
      )}

      {extraEmpty > 0 && (
        <span className={`${styles.moreEmpty} tabular`}>还空 {extraEmpty} 位</span>
      )}
    </div>
  );
}
