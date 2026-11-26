import { formatMemberAvailabilityLines } from '../domain/recommend';
import type { Night, Submission } from '../domain/types';
import { ChevronSoftIcon } from './AppIcons';
import { AvatarDot } from './AvatarChip';
import styles from './RosterDisclosure.module.css';

type RosterDisclosureProps = Readonly<{
  submissions: readonly Submission[];
  nights: readonly Night[];
  viewerMemberId: string | null;
}>;

export function RosterDisclosure({
  submissions,
  nights,
  viewerMemberId,
}: RosterDisclosureProps) {
  const availableList = submissions.filter((s) => s.answer.kind === 'available');
  const unavailableList = submissions.filter((s) => s.answer.kind === 'unavailable');

  if (submissions.length === 0) {
    return (
      <section className={styles.section} aria-label="已提交成员">
        <p className={styles.emptyText}>目前还没有人交卷，你就是第一位填表小先锋～</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="已提交成员">
      <details className={styles.details}>
        <summary className={styles.summary}>
          <span className={styles.summaryTitle}>
            已有 <strong className="tabular">{submissions.length}</strong> 位小伙伴提交
          </span>
          <span className={`${styles.summaryMeta} tabular`}>
            {availableList.length} 人有空
            {unavailableList.length > 0 ? ` · ${unavailableList.length} 人这次不行` : ''}
          </span>
          <ChevronSoftIcon size={16} className={styles.chevron} />
        </summary>

        <div className={styles.listBody}>
          {availableList.length > 0 && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>有空的人（{availableList.length}）</h3>
              <ul className={styles.list}>
                {availableList.map((sub) => {
                  const isMe = sub.memberId === viewerMemberId;
                  return (
                    <li key={sub.memberId} className={styles.row}>
                      <span className={styles.person}>
                        <AvatarDot
                          name={sub.nickname}
                          seed={sub.memberId}
                          size="sm"
                          isMe={isMe}
                        />
                        <span className={styles.name}>{sub.nickname}</span>
                        {isMe ? <span className={styles.meTag}>我</span> : null}
                      </span>
                      <span className={`${styles.times} tabular`}>
                        {formatMemberAvailabilityLines(sub, nights)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {unavailableList.length > 0 && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>这次都不行（{unavailableList.length}）</h3>
              <ul className={styles.list}>
                {unavailableList.map((sub) => {
                  const isMe = sub.memberId === viewerMemberId;
                  return (
                    <li key={sub.memberId} className={styles.row}>
                      <span className={styles.person}>
                        <AvatarDot
                          name={sub.nickname}
                          seed={sub.memberId}
                          size="sm"
                          isMe={isMe}
                        />
                        <span className={styles.name}>{sub.nickname}</span>
                        {isMe ? <span className={styles.meTag}>我</span> : null}
                      </span>
                      <span className={styles.mutedLine}>这几晚都不太方便</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
