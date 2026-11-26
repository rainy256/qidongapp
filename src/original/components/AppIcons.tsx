import type { CSSProperties, ReactNode } from 'react';

export type IconTone = 'auto' | 'violet' | 'rose' | 'honey';

export type AppIconProps = Readonly<{
  size?: number;
  className?: string;
  tone?: IconTone;
}>;

const TONE_VARS: Record<Exclude<IconTone, 'auto'>, { stroke: string; fill: string }> = {
  violet: { stroke: 'var(--icon-violet-stroke)', fill: 'var(--icon-violet-fill)' },
  rose: { stroke: 'var(--icon-rose-stroke)', fill: 'var(--icon-rose-fill)' },
  honey: { stroke: 'var(--icon-honey-stroke)', fill: 'var(--icon-honey-fill)' },
};

function resolveTone(tone: IconTone = 'auto'): {
  stroke: string;
  fill: string;
  highlight: string;
} {
  if (tone === 'auto') {
    return {
      stroke: 'currentColor',
      fill: 'color-mix(in srgb, currentColor 22%, transparent)',
      highlight: 'rgb(255 255 255 / 0.65)',
    };
  }
  const palette = TONE_VARS[tone];
  return {
    stroke: palette.stroke,
    fill: palette.fill,
    highlight: 'rgb(255 255 255 / 0.72)',
  };
}

function SvgBase({
  size = 16,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    flexShrink: 0,
    display: 'inline-block',
    verticalAlign: 'middle',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Scalloped mini boarding ticket with a 4-point center star */
export function TicketSparkIcon({ size = 16, className, tone = 'violet' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M4.5 7.5A2.5 2.5 0 0 1 7 5h10a2.5 2.5 0 0 1 2.5 2.5v2.2a2.3 2.3 0 0 0 0 4.6v2.2A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5v-2.2a2.3 2.3 0 0 0 0-4.6V7.5Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.2 13.05 10.95 15.8 12 13.05 13.05 12 15.8 10.95 13.05 8.2 12 10.95 10.95Z"
        fill="#fffaf3"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </SvgBase>
  );
}

/** Rounded boarding-pass check badge with sparkle ("已上车") */
export function BoardedTicketIcon({ size = 20, className, tone = 'violet' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <rect
        x={3.25}
        y={5.25}
        width={17.5}
        height={13.5}
        rx={4.5}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
      />
      <path
        d="m8.2 12.2 2.4 2.45 5.2-5.3"
        stroke={stroke}
        strokeWidth={2.05}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.6 3.1v3M17.1 4.6h3"
        stroke="#f492b5"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Plump 4-point starlight + baby dot sparkles */
export function StarGlintIcon({ size = 16, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M11 3.5 12.75 8.25 17.5 10 12.75 11.75 11 16.5 9.25 11.75 4.5 10 9.25 8.25Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <path
        d="M18.5 15.2v3.6M16.7 17h3.6"
        stroke={stroke}
        strokeWidth={1.85}
        strokeLinecap="round"
      />
      <circle cx={6.2} cy={17.8} r={1.15} fill={stroke} />
    </SvgBase>
  );
}

/** Soft-filled confetti cone + floating stars */
export function PartyStarIcon({ size = 15, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M4.2 19.6 8.2 8.8l7 7-11 3.8Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.2 5.4c1.3.4 2.1-.4 2.6-1.5M18.5 10.6c1.2-.2 2.1.3 2.5 1.3M11.6 4.2l-.4 2"
        stroke={stroke}
        strokeWidth={1.85}
        strokeLinecap="round"
      />
      <circle cx={19.2} cy={6.8} r={1.25} fill={stroke} />
    </SvgBase>
  );
}

/** Rounded honey-filled 3-peak crown + pearl dot */
export function CrownBadgeIcon({ size = 14, className, tone = 'rose' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M4 17.5 3.2 8.8l4.7 3.6L12 6.2l4.1 6.2 4.7-3.6-.8 8.7H4Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={12} cy={4.6} r={1.2} fill={stroke} />
      <path d="M5.5 20h13" stroke={stroke} strokeWidth={1.95} strokeLinecap="round" />
    </SvgBase>
  );
}

/** Two rounded soft-filled friend silhouettes */
export function SquadUsersIcon({ size = 15, className, tone = 'violet' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={9.3} cy={8.6} r={3.1} fill={fill} stroke={stroke} strokeWidth={1.9} />
      <path
        d="M3.8 18.8c.4-3.1 2.7-4.8 5.5-4.8s5.1 1.7 5.5 4.8"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <circle cx={16.5} cy={9.6} r={2.3} fill={fill} stroke={stroke} strokeWidth={1.85} />
      <path
        d="M16.2 14.2c2.1.2 3.8 1.6 4.2 4.3"
        stroke={stroke}
        strokeWidth={1.85}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Duotone stacked rounded report cards with micro lines */
export function CopyReportIcon({ size = 16, className, tone = 'violet' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <rect
        x={4.5}
        y={4}
        width={11}
        height={13}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.85}
      />
      <rect
        x={8.5}
        y={7}
        width={11}
        height={13}
        rx={3}
        fill={tone === 'auto' ? fill : '#fffaf4'}
        stroke={stroke}
        strokeWidth={1.95}
      />
      <path
        d="M11.6 11.4h4.8M11.6 14.8h3.4"
        stroke={stroke}
        strokeWidth={1.85}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Soft check mark with optional bare mode for micro calendar ticks */
export function CheckSoftIcon({
  size = 16,
  className,
  tone = 'auto',
  bare = false,
}: AppIconProps & Readonly<{ bare?: boolean }>) {
  const { stroke, fill } = resolveTone(tone);
  if (bare) {
    return (
      <SvgBase size={size} className={className}>
        <path
          d="m5.5 12.5 4.3 4.3 8.7-9"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </SvgBase>
    );
  }
  return (
    <SvgBase size={size} className={className}>
      <circle cx={12} cy={12} r={8.5} fill={fill} stroke={stroke} strokeWidth={1.95} />
      <path
        d="m8.4 12.3 2.5 2.55 4.8-5.1"
        stroke={stroke}
        strokeWidth={2.05}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgBase>
  );
}

/** Plump rounded plus icon with optional soft pastel halo */
export function PlusPillIcon({
  size = 15,
  className,
  tone = 'auto',
  softBack = false,
}: AppIconProps & Readonly<{ softBack?: boolean }>) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      {softBack && <circle cx={12} cy={12} r={8.8} fill={fill} />}
      <path
        d="M12 6.2v11.6M6.2 12h11.6"
        stroke={stroke}
        strokeWidth={2.15}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Plump rounded minus icon */
export function MinusPillIcon({ size = 15, className, tone = 'auto' }: AppIconProps) {
  const { stroke } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M6.2 12h11.6"
        stroke={stroke}
        strokeWidth={2.15}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Rounded warm-filled quick-join lightning bolt */
export function BoltQuickIcon({ size = 15, className, tone = 'honey' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M13.3 3.4 6.2 12.8h5.3l-1 7.8 7.3-9.5h-5.3l.8-7.7Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgBase>
  );
}

/** Soft crescent moon + tiny star dot */
export function MoonDreamIcon({ size = 15, className, tone = 'violet' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M18.6 14.9A7.4 7.4 0 0 1 9.1 5.4a7.6 7.6 0 1 0 9.5 9.5Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={17.2} cy={6.8} r={1.25} fill={stroke} />
    </SvgBase>
  );
}

/** Rounded duotone pencil */
export function PencilSoftIcon({ size = 14, className, tone = 'rose' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M15.4 4.8a2.2 2.2 0 0 1 3.1 3.1L8.9 17.5l-4 .9.9-4 9.6-9.6Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m13.6 6.6 3.1 3.1"
        stroke={stroke}
        strokeWidth={1.85}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Plump rounded right arrow with soft pill trail */
export function ArrowSoftIcon({ size = 16, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={6.2} cy={12} r={2.2} fill={fill} />
      <path
        d="M6.2 12h11.8m-4.3-4.5L18.2 12l-4.5 4.5"
        stroke={stroke}
        strokeWidth={2.05}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgBase>
  );
}

/** Plump rounded chevron */
export function ChevronSoftIcon({ size = 15, className, tone = 'auto' }: AppIconProps) {
  const { stroke } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="m6.5 9.4 5.5 5.3 5.5-5.3"
        stroke={stroke}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgBase>
  );
}

/** Two rounded rails with soft pastel-filled circular knobs */
export function SlidersSoftIcon({ size = 16, className, tone = 'violet' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M4.2 8h15.6M4.2 16h15.6"
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
      />
      <circle cx={9.2} cy={8} r={2.6} fill={fill} stroke={stroke} strokeWidth={1.9} />
      <circle cx={15} cy={16} r={2.6} fill={fill} stroke={stroke} strokeWidth={1.9} />
    </SvgBase>
  );
}

/** Rounded duotone trash bin */
export function TrashSoftIcon({ size = 15, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="M5.8 7.6h12.4l-.8 10.6a2 2 0 0 1-2 1.8H8.6a2 2 0 0 1-2-1.8L5.8 7.6Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <path
        d="M4.2 7.6h15.6M9.6 4.4h4.8M10.2 11.4v4.8m3.6-4.8v4.8"
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Soft rounded padlock */
export function LockSoftIcon({ size = 14, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <rect
        x={5.2}
        y={10.4}
        width={13.6}
        height={9.4}
        rx={3.2}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.95}
      />
      <path
        d="M8.5 10.4V7.8a3.5 3.5 0 0 1 7 0v2.6"
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
      />
      <circle cx={12} cy={15} r={1.15} fill={stroke} />
    </SvgBase>
  );
}

/** Soft rounded offline badge */
export function WifiOffSoftIcon({ size = 15, className, tone = 'honey' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={12} cy={17.2} r={1.8} fill={fill} stroke={stroke} strokeWidth={1.8} />
      <path
        d="M8.5 13.8a5.2 5.2 0 0 1 7 0M5.4 10.6a9.6 9.6 0 0 1 13.2 0M4.5 5l15 14"
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Rounded refresh loop */
export function RefreshSoftIcon({ size = 14, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={12} cy={12} r={7.5} fill={fill} />
      <path
        d="M17.8 9.2A6.5 6.5 0 0 0 6.5 8.5M6.2 14.8a6.5 6.5 0 0 0 11.3.7"
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
      />
      <path
        d="M15.2 9.4h3v-3M8.8 14.6h-3v3"
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgBase>
  );
}

/** Soft rounded alert badge */
export function AlertSoftIcon({ size = 15, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={12} cy={12} r={8.5} fill={fill} stroke={stroke} strokeWidth={1.95} />
      <path d="M12 8.1v4.6" stroke={stroke} strokeWidth={2.05} strokeLinecap="round" />
      <circle cx={12} cy={15.8} r={1.1} fill={stroke} />
    </SvgBase>
  );
}

/** Soft rounded info pill */
export function InfoSoftIcon({ size = 16, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={12} cy={12} r={8.5} fill={fill} stroke={stroke} strokeWidth={1.95} />
      <path d="M12 11.4v4.5" stroke={stroke} strokeWidth={2.05} strokeLinecap="round" />
      <circle cx={12} cy={8.2} r={1.1} fill={stroke} />
    </SvgBase>
  );
}

/** Plump rounded close icon */
export function CloseSoftIcon({ size = 16, className, tone = 'auto' }: AppIconProps) {
  const { stroke } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke={stroke}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Rounded friend-add icon for DemoToolbar */
export function UserPlusSoftIcon({ size = 14, className, tone = 'violet' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={10} cy={8.5} r={3.2} fill={fill} stroke={stroke} strokeWidth={1.9} />
      <path
        d="M4.2 19c.5-3.2 2.9-5 5.8-5s5.3 1.8 5.8 5"
        fill={fill}
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <path
        d="M18.2 8.2v4.6M15.9 10.5h4.6"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </SvgBase>
  );
}

/** Rounded reset arrow */
export function ResetSoftIcon({ size = 14, className, tone = 'auto' }: AppIconProps) {
  const { stroke, fill } = resolveTone(tone);
  return (
    <SvgBase size={size} className={className}>
      <circle cx={12} cy={12} r={7.2} fill={fill} />
      <path
        d="M6.4 10.6a6.2 6.2 0 1 1-.2 3.8"
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
      />
      <path
        d="M5.5 6.8v4.2h4.2"
        stroke={stroke}
        strokeWidth={1.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgBase>
  );
}
