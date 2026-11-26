import { useId } from 'react';
import styles from './MascotBadge.module.css';

export type MascotMood = 'create' | 'waiting' | 'happy' | 'closed';

type MascotBadgeProps = Readonly<{
  mood: MascotMood;
  size?: number;
}>;

export function MascotBadge({ mood, size = 56 }: MascotBadgeProps) {
  const gradId = useId();

  const bgGradient =
    mood === 'happy'
      ? 'linear-gradient(135deg, #F3EEFF 0%, #FFF0F7 100%)'
      : mood === 'waiting'
        ? 'linear-gradient(135deg, #FFF7DC 0%, #FFECE6 100%)'
        : mood === 'closed'
          ? 'linear-gradient(135deg, #F6EFF9 0%, #EFE8E0 100%)'
          : 'linear-gradient(135deg, #FFF0F7 0%, #F3EEFF 100%)';

  const ringTint =
    mood === 'happy'
      ? '#D5C9FB'
      : mood === 'waiting'
        ? '#F2C65A'
        : mood === 'closed'
          ? '#D8CCE6'
          : '#F2C4DC';

  return (
    <div
      className={`${styles.badge} ${mood === 'happy' || mood === 'create' ? styles.bob : ''}`}
      style={{ width: size, height: size, backgroundImage: bgGradient, borderColor: ringTint }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" width={size - 6} height={size - 6} fill="none">
        <defs>
          <linearGradient id={gradId} x1="16" y1="16" x2="48" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#FAF3FF" />
          </linearGradient>
        </defs>

        {/* Soft crown for closed */}
        {mood === 'closed' && (
          <path
            d="M22 15 L25 7 L32 12 L39 7 L42 15 Z"
            fill="#FFE28A"
            stroke="#965B12"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}

        {/* Cute round ears */}
        <circle cx="20" cy="19" r="6" fill={`url(#${gradId})`} stroke="#5B4578" strokeWidth="2.3" />
        <circle cx="44" cy="19" r="6" fill={`url(#${gradId})`} stroke="#5B4578" strokeWidth="2.3" />
        <circle cx="20" cy="19.5" r="2.8" fill="#F5A8CC" />
        <circle cx="44" cy="19.5" r="2.8" fill="#F5A8CC" />

        {/* Plump mochi body */}
        <rect
          x="13"
          y="17"
          width="38"
          height="34"
          rx="18"
          fill={`url(#${gradId})`}
          stroke="#5B4578"
          strokeWidth="2.4"
        />

        {/* Rosy orchid cheeks */}
        <ellipse cx="21" cy="36" rx="4.2" ry="2.4" fill="#F5A8CC" opacity="0.82" />
        <ellipse cx="43" cy="36" rx="4.2" ry="2.4" fill="#F5A8CC" opacity="0.82" />

        {/* Eyes & mouth by mood */}
        {mood === 'happy' ? (
          <>
            <path
              d="M22 31 Q24.5 27.5 27 31"
              stroke="#5B4578"
              strokeWidth="2.35"
              strokeLinecap="round"
            />
            <path
              d="M37 31 Q39.5 27.5 42 31"
              stroke="#5B4578"
              strokeWidth="2.35"
              strokeLinecap="round"
            />
            <path
              d="M28 35 Q32 40 36 35"
              stroke="#5B4578"
              strokeWidth="2.3"
              strokeLinecap="round"
              fill="#F492B5"
            />
          </>
        ) : mood === 'waiting' ? (
          <>
            <circle cx="24" cy="30.5" r="2.4" fill="#5B4578" />
            <circle cx="24.8" cy="29.6" r="0.8" fill="#FFFFFF" />
            <path
              d="M37 31 Q39.5 28 42 31"
              stroke="#5B4578"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            <path
              d="M29.5 35.5 Q32 37.8 34.5 35.5"
              stroke="#5B4578"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </>
        ) : mood === 'closed' ? (
          <>
            <path
              d="M22 30.5 Q24.5 33 27 30.5"
              stroke="#5B4578"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            <path
              d="M37 30.5 Q39.5 33 42 30.5"
              stroke="#5B4578"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            <path
              d="M29.5 35.5 Q32 38 34.5 35.5"
              stroke="#5B4578"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <circle cx="24.5" cy="30.5" r="2.5" fill="#5B4578" />
            <circle cx="39.5" cy="30.5" r="2.5" fill="#5B4578" />
            <circle cx="25.3" cy="29.6" r="0.85" fill="#FFFFFF" />
            <circle cx="40.3" cy="29.6" r="0.85" fill="#FFFFFF" />
            <path
              d="M29 35.2 Q32 38.4 35 35.2"
              stroke="#5B4578"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Little decorative sparkle / heart */}
        {mood === 'create' && (
          <path
            d="M52 13 C52 10.8 49 10.5 48.2 12.6 C47.4 10.5 44.4 10.8 44.4 13 C44.4 15.6 48.2 18.2 48.2 18.2 C48.2 18.2 52 15.6 52 13 Z"
            fill="#F492B5"
          />
        )}
        {mood === 'happy' && (
          <>
            <path
              d="M11 10 L12.3 13 L15.3 14.3 L12.3 15.6 L11 18.6 L9.7 15.6 L6.7 14.3 L9.7 13 Z"
              fill="#8A68F7"
            />
            <path
              d="M54 11 L55 13.4 L57.4 14.4 L55 15.4 L54 17.8 L53 15.4 L50.6 14.4 L53 13.4 Z"
              fill="#F292B5"
            />
          </>
        )}
        {mood === 'waiting' && (
          <path
            d="M53 12 L54.2 14.8 L57 16 L54.2 17.2 L53 20 L51.8 17.2 L49 16 L51.8 14.8 Z"
            fill="#F2B441"
          />
        )}
      </svg>
    </div>
  );
}
