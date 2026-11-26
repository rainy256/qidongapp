import { useState } from 'react';
import { inferGameTag } from '../domain/recommend';
import type { GameTag } from '../domain/types';
import styles from './GameArtwork.module.css';

export { inferGameTag };

export function HeroSquadIllustration() {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className={styles.heroWrap}>
      <img
        src="/art/hero-runner.png?v=2"
        alt="飞奔赶来开黑的小伙伴"
        loading="eager"
        decoding="async"
        className={styles.heroImg}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

type GameStickerArtProps = Readonly<{
  game: GameTag;
  size?: number;
}>;

export function GameStickerArt({ game, size = 76 }: GameStickerArtProps) {
  const [failed, setFailed] = useState(false);
  const isFullBleed = game === 'tarkov';

  return (
    <div
      className={`${styles.stickerWrap} ${isFullBleed ? styles.stickerFullBleed : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {!failed ? (
        <img
          src={`/art/game-${game}.png?v=4`}
          alt=""
          width={size}
          height={size}
          loading="eager"
          decoding="async"
          className={`${styles.stickerImg} ${isFullBleed ? styles.stickerImgFull : ''}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.fallbackBadge}>{game.toUpperCase()}</span>
      )}
    </div>
  );
}
