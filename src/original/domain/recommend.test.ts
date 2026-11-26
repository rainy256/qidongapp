import { describe, expect, it } from 'vitest';
import {
  buildRoomShareMeta,
  computeDraftFeedback,
  computeOthersSlotAvailability,
  computeOverlapSpans,
  formatCandidateBadge,
  formatCandidateProgress,
  formatGroupNotice,
  getHeatLevel,
  getRoomCompletionState,
  mergeSpans,
  recommend,
} from './recommend';
import {
  buildPresetRoomTitle,
  buildUpcomingDateOptions,
  formatSelectedDatesTitlePrefix,
  formatSlotInNight,
  formatSpanInNight,
  pickDefaultWeekendDates,
  shanghaiToSlot,
} from './time';
import type { Night, RoomSnapshot, Submission } from './types';

describe('recommendation engine & time domain', () => {
  const fri: Night = {
    id: 'fri',
    dateKey: '2026-11-27',
    from: shanghaiToSlot('2026-11-27', 19, 0),
    to: shanghaiToSlot('2026-11-27', 23, 0),
  };

  const sat: Night = {
    id: 'sat',
    dateKey: '2026-11-28',
    from: shanghaiToSlot('2026-11-28', 19, 0),
    to: shanghaiToSlot('2026-11-28', 23, 0),
  };

  it('prevents false positive on the 4-player 2h counterexample (甲乙丙 20-22, 丁 20-21, 戊 21-22)', () => {
    const t20 = shanghaiToSlot('2026-11-27', 20, 0);
    const t21 = shanghaiToSlot('2026-11-27', 21, 0);
    const t22 = shanghaiToSlot('2026-11-27', 22, 0);

    const submissions: Submission[] = [
      {
        memberId: 'a',
        nickname: '甲',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t22 }] },
        updatedAt: '2026-11-27T10:00:00Z',
      },
      {
        memberId: 'b',
        nickname: '乙',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t22 }] },
        updatedAt: '2026-11-27T10:01:00Z',
      },
      {
        memberId: 'c',
        nickname: '丙',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t22 }] },
        updatedAt: '2026-11-27T10:02:00Z',
      },
      {
        memberId: 'd',
        nickname: '丁',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t21 }] },
        updatedAt: '2026-11-27T10:03:00Z',
      },
      {
        memberId: 'e',
        nickname: '戊',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t21, to: t22 }] },
        updatedAt: '2026-11-27T10:04:00Z',
      },
    ];

    // Confirm per-slot density really is 4 across all four 30-min slots [20:00, 22:00)
    const cells = computeOthersSlotAvailability(fri, submissions, null).filter(
      (c) => c.slot >= t20 && c.slot < t22,
    );
    expect(cells.map((c) => c.count)).toEqual([4, 4, 4, 4]);

    // At 2 hours (4 slots), ONLY [甲, 乙, 丙] can play continuously -> missingPlayers = 1!
    const res2h = recommend({
      nights: [fri],
      targetPlayers: 4,
      durationSlots: 4,
      earliestStart: fri.from,
      submissions,
    });
    expect(res2h).toHaveLength(1);
    expect(res2h[0].memberIds).toEqual(['a', 'b', 'c']);
    expect(res2h[0].missingPlayers).toBe(1);
    expect(res2h[0].firstStart).toBe(t20);
    expect(res2h[0].availableUntil).toBe(t22);

    // At 1 hour (2 slots), BOTH 20:00 [甲乙丙丁] and 21:00 [甲乙丙戊] qualify with 4 players
    const res1h = recommend({
      nights: [fri],
      targetPlayers: 4,
      durationSlots: 2,
      earliestStart: fri.from,
      submissions,
    });
    const ready1h = res1h.filter((c) => c.missingPlayers === 0);
    expect(ready1h).toHaveLength(2);
    expect(ready1h[0].memberIds).toEqual(['a', 'b', 'c', 'd']);
    expect(ready1h[0].firstStart).toBe(t20);
    expect(ready1h[0].lastStart).toBe(t20);
    expect(ready1h[1].memberIds).toEqual(['a', 'b', 'c', 'e']);
    expect(ready1h[1].firstStart).toBe(t21);
    expect(ready1h[1].lastStart).toBe(t21);
  });

  it('merges adjacent intervals, preserves dinner breaks, and does not truncate cohort when someone joins midway', () => {
    const t19 = shanghaiToSlot('2026-11-27', 19, 0);
    const t20 = shanghaiToSlot('2026-11-27', 20, 0);
    const t21 = shanghaiToSlot('2026-11-27', 21, 0);
    const t22 = shanghaiToSlot('2026-11-27', 22, 0);
    const t23 = shanghaiToSlot('2026-11-27', 23, 0);

    // Adjacent merges; gap preserves
    expect(mergeSpans([{ from: t19, to: t20 }, { from: t20, to: t21 }])).toEqual([
      { from: t19, to: t21 },
    ]);
    expect(mergeSpans([{ from: t19, to: t20 }, { from: t21, to: t23 }])).toEqual([
      { from: t19, to: t20 },
      { from: t21, to: t23 },
    ]);

    // 4 players 20-23, 5th joins only 21-22; duration 1h (2 slots)
    const submissions: Submission[] = [
      ...['m1', 'm2', 'm3', 'm4'].map((id) => ({
        memberId: id,
        nickname: id,
        answer: { kind: 'available' as const, picks: [{ nightId: 'fri', from: t20, to: t23 }] },
        updatedAt: '2026-11-27T10:00:00Z',
      })),
      {
        memberId: 'm5',
        nickname: 'm5',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t21, to: t22 }] },
        updatedAt: '2026-11-27T10:05:00Z',
      },
    ];

    const res = recommend({
      nights: [fri],
      targetPlayers: 4,
      durationSlots: 2,
      earliestStart: fri.from,
      submissions,
    });

    const fourRoster = res.find((c) => c.memberIds.length === 4);
    expect(fourRoster).toBeDefined();
    expect(fourRoster?.firstStart).toBe(t20);
    expect(fourRoster?.availableUntil).toBe(t23);
    expect(fourRoster?.lastStart).toBe(t22);
  });

  it('ranks Friday 5-player ready option ahead of Saturday 6-player ready option', () => {
    const fri20 = shanghaiToSlot('2026-11-27', 20, 0);
    const fri22 = shanghaiToSlot('2026-11-27', 22, 0);
    const sat20 = shanghaiToSlot('2026-11-28', 20, 0);
    const sat22 = shanghaiToSlot('2026-11-28', 22, 0);

    const submissions: Submission[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id, i) => ({
      memberId: id,
      nickname: id,
      answer: {
        kind: 'available',
        picks:
          i < 5
            ? [
                { nightId: 'fri', from: fri20, to: fri22 },
                { nightId: 'sat', from: sat20, to: sat22 },
              ]
            : [{ nightId: 'sat', from: sat20, to: sat22 }],
      },
      updatedAt: '2026-11-27T10:00:00Z',
    }));

    const res = recommend({
      nights: [fri, sat],
      targetPlayers: 5,
      durationSlots: 4,
      earliestStart: fri.from,
      submissions,
    });

    expect(res[0].nightId).toBe('fri');
    expect(res[0].memberIds).toHaveLength(5);
    expect(res[1].nightId).toBe('sat');
    expect(res[1].memberIds).toHaveLength(6);
  });

  it('handles cross-midnight positive duration and 次日 formatting', () => {
    const nightMid: Night = {
      id: 'mid',
      dateKey: '2026-11-27',
      from: shanghaiToSlot('2026-11-27', 20, 0),
      to: shanghaiToSlot('2026-11-28', 3, 0),
    };
    const start22 = shanghaiToSlot('2026-11-27', 22, 0);
    const end02 = shanghaiToSlot('2026-11-27', 2, 0, true);

    expect(end02 - start22).toBe(8);
    expect(formatSlotInNight(end02, nightMid.dateKey)).toBe('次日 02:00');
    expect(formatSpanInNight(nightMid, { from: start22, to: end02 })).toBe('22:00–次日 02:00');
  });

  it('computes accurate live draft feedback with unsaved reminder', () => {
    const t20 = shanghaiToSlot('2026-11-27', 20, 0);
    const t23 = shanghaiToSlot('2026-11-27', 23, 0);

    const snapshot: RoomSnapshot = {
      id: 'r1',
      title: '五排',
      tzid: 'Asia/Shanghai',
      nights: [fri],
      targetPlayers: 5,
      durationSlots: 4,
      roomRevision: 1,
      closedAt: null,
      submissions: ['p1', 'p2', 'p3', 'p4'].map((id) => ({
        memberId: id,
        nickname: id,
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t23 }] },
        updatedAt: '2026-11-27T10:00:00Z',
      })),
      viewer: { memberId: null, canClose: false, mineRevision: 0 },
      syncedAt: '2026-11-27T11:00:00Z',
    };

    const fb = computeDraftFeedback(
      snapshot,
      [{ nightId: 'fri', from: t20, to: t23 }],
      'available',
      true,
      fri.from,
    );

    expect(fb?.tone).toBe('ready');
    expect(fb?.message).toContain('算上你');
    expect(fb?.message).toContain('凑齐 5 人');
    expect(fb?.message).toContain('尚未保存');
  });

  it('computes merged overlap spans for >=2 players and target threshold while preserving gaps', () => {
    const t19 = shanghaiToSlot('2026-11-27', 19, 0);
    const t20 = shanghaiToSlot('2026-11-27', 20, 0);
    const t21 = shanghaiToSlot('2026-11-27', 21, 0);
    const t22 = shanghaiToSlot('2026-11-27', 22, 0);

    const single = computeOthersSlotAvailability(
      fri,
      [
        {
          memberId: 'p1',
          nickname: 'A',
          answer: { kind: 'available', picks: [{ nightId: 'fri', from: t19, to: t22 }] },
          updatedAt: '2026-11-27T10:00:00Z',
        },
      ],
      null,
    );
    expect(computeOverlapSpans([], 2)).toEqual([]);
    expect(computeOverlapSpans(single, 2)).toEqual([]);

    const multi = computeOthersSlotAvailability(
      fri,
      [
        {
          memberId: 'p1',
          nickname: 'A',
          answer: { kind: 'available', picks: [{ nightId: 'fri', from: t19, to: t22 }] },
          updatedAt: '2026-11-27T10:00:00Z',
        },
        {
          memberId: 'p2',
          nickname: 'B',
          answer: {
            kind: 'available',
            picks: [
              { nightId: 'fri', from: t19, to: t20 },
              { nightId: 'fri', from: t21, to: t22 },
            ],
          },
          updatedAt: '2026-11-27T10:01:00Z',
        },
        {
          memberId: 'p3',
          nickname: 'C',
          answer: { kind: 'available', picks: [{ nightId: 'fri', from: t21, to: t22 }] },
          updatedAt: '2026-11-27T10:02:00Z',
        },
      ],
      null,
    );

    expect(computeOverlapSpans(multi, 2)).toEqual([
      { from: t19, to: t20 },
      { from: t21, to: t22 },
    ]);
    expect(computeOverlapSpans(multi, 3)).toEqual([{ from: t21, to: t22 }]);
  });

  it('picks contiguous default weekend dates and formats preset room titles matching selected dates', () => {
    const wedOpts = buildUpcomingDateOptions('2026-11-25', 10);
    expect(pickDefaultWeekendDates(wedOpts)).toEqual(['2026-11-27', '2026-11-28', '2026-11-29']);

    const satOpts = buildUpcomingDateOptions('2026-11-28', 10);
    expect(pickDefaultWeekendDates(satOpts)).toEqual(['2026-11-28', '2026-11-29']);

    const sunOpts = buildUpcomingDateOptions('2026-11-29', 10);
    expect(pickDefaultWeekendDates(sunOpts)).toEqual(['2026-12-04', '2026-12-05', '2026-12-06']);

    const today = '2026-11-25';
    expect(formatSelectedDatesTitlePrefix(['2026-11-25'], today)).toBe('今晚');
    expect(formatSelectedDatesTitlePrefix(['2026-11-26'], today)).toBe('明晚');
    expect(formatSelectedDatesTitlePrefix(['2026-11-27'], today)).toBe('周五晚');

    const titles = [
      buildPresetRoomTitle('apex', ['2026-11-25'], today, 3),
      buildPresetRoomTitle('gta', ['2026-11-26'], today, 4),
      buildPresetRoomTitle('apex', ['2026-11-27'], today, 3),
      buildPresetRoomTitle('apex', ['2026-11-27', '2026-11-28', '2026-11-29'], today, 3),
      buildPresetRoomTitle('gta', ['2026-11-25', '2026-11-26'], today, 4),
      buildPresetRoomTitle('tarkov', ['2026-11-25', '2026-11-27'], today, 4),
      buildPresetRoomTitle('apex', ['2026-11-25'], today, 2),
      buildPresetRoomTitle('custom', ['2026-11-25'], today, 4),
    ];

    expect(titles).toEqual([
      '今晚 Apex 三排',
      '明晚 GTA 抢劫分红车',
      '周五晚 Apex 三排',
      '周末 Apex 三排',
      '周三–周四 GTA 抢劫分红车',
      '周三、周五 塔科夫跑图车队',
      '今晚 Apex 双排',
      '',
    ]);
    for (const t of titles) {
      expect(Array.from(t).length).toBeLessThanOrEqual(32);
    }
  });

  it('builds dynamic share card metadata across empty, almost, ready, no-overlap, and closed rooms', () => {
    const t20 = shanghaiToSlot('2026-11-27', 20, 0);
    const t22 = shanghaiToSlot('2026-11-27', 22, 0);
    const baseRoom: RoomSnapshot = {
      id: 'r-test123',
      title: '周五晚 Apex 三排',
      gameTag: 'apex',
      tzid: 'Asia/Shanghai',
      nights: [fri, sat],
      targetPlayers: 3,
      durationSlots: 4,
      roomRevision: 1,
      closedAt: null,
      submissions: [],
      viewer: { memberId: null, canClose: false, mineRevision: 0 },
      syncedAt: '2026-11-27T11:00:00Z',
    };

    const customOrigin = 'https://game.example.com/';
    const emptyMeta = buildRoomShareMeta(baseRoom, customOrigin);
    expect(emptyMeta.title).toBe('【周五晚 Apex 三排】0/3 人已填 · 点击上车');
    expect(emptyMeta.imageUrl).toBe('https://game.example.com/art/game-apex.png');
    expect(emptyMeta.canonicalUrl).toBe('https://game.example.com/r/r-test123');
    expect(emptyMeta.description).toContain('3 人发车');

    const twoPlayers: Submission[] = [
      {
        memberId: 'u1',
        nickname: '阿哲',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t22 }] },
        updatedAt: '2026-11-27T10:00:00Z',
      },
      {
        memberId: 'u2',
        nickname: '小满',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t22 }] },
        updatedAt: '2026-11-27T10:01:00Z',
      },
    ];
    const almostMeta = buildRoomShareMeta({ ...baseRoom, submissions: twoPlayers }, customOrigin);
    expect(almostMeta.title).toBe('【周五晚 Apex 三排】已有 2/3 人重合 · 还差 1 人');
    expect(almostMeta.description).toContain('周五 20:00–22:00');
    expect(almostMeta.description).toContain('阿哲和小满');

    const threePlayers: Submission[] = [
      ...twoPlayers,
      {
        memberId: 'u3',
        nickname: '七七',
        answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t22 }] },
        updatedAt: '2026-11-27T10:02:00Z',
      },
    ];
    const readyMeta = buildRoomShareMeta({ ...baseRoom, submissions: threePlayers }, customOrigin);
    expect(readyMeta.title).toBe('【周五晚 Apex 三排】已凑齐 3/3 人 · 周五 20:00 开');
    expect(readyMeta.description).toContain('可连玩满 2 小时');

    const closedMeta = buildRoomShareMeta(
      { ...baseRoom, submissions: threePlayers, closedAt: '2026-11-27T11:30:00Z' },
      customOrigin,
    );
    expect(closedMeta.title).toBe('【已定场】周五晚 Apex 三排 · 周五 20:00 开');
    expect(closedMeta.description).toContain('已定场');

    const noOverlapMeta = buildRoomShareMeta(
      {
        ...baseRoom,
        submissions: [
          {
            memberId: 'u1',
            nickname: '阿哲',
            answer: {
              kind: 'available',
              picks: [{ nightId: 'fri', from: t20, to: shanghaiToSlot('2026-11-27', 21, 0) }],
            },
            updatedAt: '2026-11-27T10:00:00Z',
          },
          {
            memberId: 'u4',
            nickname: '阿凯',
            answer: { kind: 'unavailable' },
            updatedAt: '2026-11-27T10:01:00Z',
          },
        ],
      },
      customOrigin,
    );
    expect(noOverlapMeta.title).toBe('【周五晚 Apex 三排】已有 2 人填完 · 点击来凑时间');
    expect(noOverlapMeta.description).toContain('1 人这次不行');
  });

  it('formats multi-line group chat battle report with alternatives and unavailable notes', () => {
    const t20 = shanghaiToSlot('2026-11-27', 20, 0);
    const t23 = shanghaiToSlot('2026-11-27', 23, 0);
    const sat20 = shanghaiToSlot('2026-11-28', 20, 0);
    const sat23 = shanghaiToSlot('2026-11-28', 23, 0);
    const inviteUrl = 'https://game.example.com/r/r-test123';

    const baseRoom: RoomSnapshot = {
      id: 'r-test123',
      title: '周五晚 Apex 三排',
      gameTag: 'apex',
      tzid: 'Asia/Shanghai',
      nights: [fri, sat],
      targetPlayers: 3,
      durationSlots: 4,
      roomRevision: 2,
      closedAt: null,
      submissions: [],
      viewer: { memberId: null, canClose: false, mineRevision: 0 },
      syncedAt: '2026-11-27T11:00:00Z',
    };

    const emptyNotice = formatGroupNotice(baseRoom, null, inviteUrl, false);
    expect(emptyNotice).toContain('0/3 人已填');
    expect(emptyNotice).toContain(inviteUrl);

    const almostRoom: RoomSnapshot = {
      ...baseRoom,
      submissions: [
        {
          memberId: 'u1',
          nickname: '阿哲',
          answer: {
            kind: 'available',
            picks: [
              { nightId: 'fri', from: t20, to: t23 },
              { nightId: 'sat', from: sat20, to: sat23 },
            ],
          },
          updatedAt: '2026-11-27T10:00:00Z',
        },
        {
          memberId: 'u2',
          nickname: '小满',
          answer: {
            kind: 'available',
            picks: [
              { nightId: 'fri', from: t20, to: t23 },
              { nightId: 'sat', from: sat20, to: sat23 },
            ],
          },
          updatedAt: '2026-11-27T10:01:00Z',
        },
        {
          memberId: 'u4',
          nickname: '阿凯',
          answer: { kind: 'unavailable' },
          updatedAt: '2026-11-27T10:02:00Z',
        },
      ],
    };
    const almostRecs = recommend({
      nights: almostRoom.nights,
      targetPlayers: almostRoom.targetPlayers,
      durationSlots: almostRoom.durationSlots,
      earliestStart: fri.from,
      submissions: almostRoom.submissions,
    });
    const almostNotice = formatGroupNotice(almostRoom, almostRecs[0], inviteUrl, false, [
      almostRecs[1],
    ]);
    expect(almostNotice).toContain('还差 1 人发车（已有 2/3 人重合）');
    expect(almostNotice).toContain('最佳重合：周五 20:00–23:00（阿哲、小满，都能连玩满 2 小时）');
    expect(almostNotice).toContain('备选时段：周六 20:00–23:00（2 人，差 1 人）');
    expect(almostNotice).toContain('本次不便：阿凯');
    expect(almostNotice).toContain(inviteUrl);

    const readyRoom: RoomSnapshot = {
      ...almostRoom,
      submissions: [
        ...almostRoom.submissions,
        {
          memberId: 'u3',
          nickname: '七七',
          answer: { kind: 'available', picks: [{ nightId: 'fri', from: t20, to: t23 }] },
          updatedAt: '2026-11-27T10:03:00Z',
        },
      ],
    };
    const readyRecs = recommend({
      nights: readyRoom.nights,
      targetPlayers: readyRoom.targetPlayers,
      durationSlots: readyRoom.durationSlots,
      earliestStart: fri.from,
      submissions: readyRoom.submissions,
    });
    const readyNotice = formatGroupNotice(readyRoom, readyRecs[0], inviteUrl, false, [
      readyRecs[1],
    ]);
    expect(readyNotice).toContain('已凑齐 3/3 人');
    expect(readyNotice).toContain('推荐发车：周五 20:00–23:00（阿哲、小满、七七，满 2 小时，最晚 21:00 开）');
    expect(readyNotice).toContain('备选时段：周六 20:00–23:00');
    expect(readyNotice).toContain(inviteUrl);

    const closedNotice = formatGroupNotice(
      { ...readyRoom, closedAt: '2026-11-27T11:30:00Z' },
      readyRecs[0],
      inviteUrl,
      false,
    );
    expect(closedNotice).toContain('已定场');
    expect(closedNotice).toContain('已锁定本场');

    const noOverlapNotice = formatGroupNotice(
      {
        ...baseRoom,
        submissions: [
          {
            memberId: 'u1',
            nickname: '阿哲',
            answer: {
              kind: 'available',
              picks: [{ nightId: 'fri', from: t20, to: shanghaiToSlot('2026-11-27', 21, 0) }],
            },
            updatedAt: '2026-11-27T10:00:00Z',
          },
          {
            memberId: 'u4',
            nickname: '阿凯',
            answer: { kind: 'unavailable' },
            updatedAt: '2026-11-27T10:02:00Z',
          },
        ],
      },
      null,
      inviteUrl,
      false,
    );
    expect(noOverlapNotice).toContain('已有 2 人填完（1 人有空，1 人本次不行）');
    expect(noOverlapNotice).toContain('暂未凑出满 2 小时 的连续重合时段');
    expect(noOverlapNotice).toContain(inviteUrl);
  });


  it('distinguishes closed-but-incomplete rooms and describes over-target groups clearly', () => {
    const t20 = shanghaiToSlot('2026-11-27', 20, 0);
    const t21 = shanghaiToSlot('2026-11-27', 21, 0);
    const t22 = shanghaiToSlot('2026-11-27', 22, 0);
    const closedAt = '2026-11-27T11:30:00Z';
    const inviteUrl = 'https://game.example.com/r/r-test123';
    const baseRoom: RoomSnapshot = {
      id: 'r-test123',
      title: '周五晚 Apex 三排',
      gameTag: 'apex',
      tzid: 'Asia/Shanghai',
      nights: [fri, sat],
      targetPlayers: 3,
      durationSlots: 4,
      roomRevision: 3,
      closedAt: null,
      submissions: [],
      viewer: { memberId: null, canClose: false, mineRevision: 0 },
      syncedAt: '2026-11-27T11:00:00Z',
    };
    const available = (memberId: string, from = t20, to = t22): Submission => ({
      memberId,
      nickname: memberId,
      answer: { kind: 'available', picks: [{ nightId: 'fri', from, to }] },
      updatedAt: '2026-11-27T10:00:00Z',
    });
    const getPrimary = (submissions: Submission[]) =>
      recommend({
        nights: baseRoom.nights,
        targetPlayers: baseRoom.targetPlayers,
        durationSlots: baseRoom.durationSlots,
        earliestStart: baseRoom.nights[0].from,
        submissions,
      })[0] ?? null;

    const almostSubmissions = [available('u1'), available('u2')];
    const closedAlmost = { ...baseRoom, closedAt, submissions: almostSubmissions };
    const almostCandidate = getPrimary(almostSubmissions);
    expect(almostCandidate?.missingPlayers).toBe(1);
    expect(getRoomCompletionState(closedAt, almostCandidate)).toBe('closed-incomplete');
    const almostMeta = buildRoomShareMeta(closedAlmost, 'https://game.example.com');
    expect(almostMeta.title).toContain('收集已结束·未凑齐');
    expect(almostMeta.title).toContain('还差 1 人');
    expect(almostMeta.title).not.toContain('已定场');
    expect(almostMeta.description).toContain('未达到发车人数要求');
    const almostNotice = formatGroupNotice(closedAlmost, almostCandidate, inviteUrl, false);
    expect(almostNotice).toContain('收集已结束（未凑齐）');
    expect(almostNotice).toContain('还差 1 人发车');
    expect(almostNotice).not.toContain('已定场');

    const readySubmissions = [available('u1'), available('u2'), available('u3')];
    const closedReady = { ...baseRoom, closedAt, submissions: readySubmissions };
    const readyCandidate = getPrimary(readySubmissions);
    expect(getRoomCompletionState(closedAt, readyCandidate)).toBe('settled');
    const readyMeta = buildRoomShareMeta(closedReady, 'https://game.example.com');
    expect(readyMeta.title).toContain('【已定场】');
    expect(readyMeta.description).toContain('3 人已定场');
    const readyNotice = formatGroupNotice(closedReady, readyCandidate, inviteUrl, false);
    expect(readyNotice).toContain('已定场');
    expect(readyNotice).toContain('已锁定本场');

    const noOverlapSubmissions = [
      available('u1', t20, t21),
      {
        memberId: 'u2',
        nickname: 'u2',
        answer: { kind: 'unavailable' as const },
        updatedAt: '2026-11-27T10:01:00Z',
      },
    ];
    const closedNoOverlap = { ...baseRoom, closedAt, submissions: noOverlapSubmissions };
    const noOverlapCandidate = getPrimary(noOverlapSubmissions);
    expect(noOverlapCandidate).toBeNull();
    expect(getRoomCompletionState(closedAt, noOverlapCandidate)).toBe('closed-incomplete');
    const noOverlapMeta = buildRoomShareMeta(closedNoOverlap, 'https://game.example.com');
    expect(noOverlapMeta.title).toContain('收集已结束·未凑齐');
    expect(noOverlapMeta.title).not.toContain('已定场');
    expect(noOverlapMeta.description).toContain('未凑出满足人数和时长要求');
    const noOverlapNotice = formatGroupNotice(closedNoOverlap, null, inviteUrl, false);
    expect(noOverlapNotice).toContain('收集已结束（未凑齐）');
    expect(noOverlapNotice).not.toContain('已定场');

    const overTargetSubmissions = [
      available('u1'),
      available('u2'),
      available('u3'),
      available('u4'),
    ];
    const overTargetCandidate = getPrimary(overTargetSubmissions);
    expect(overTargetCandidate?.missingPlayers).toBe(0);
    expect(formatCandidateProgress(overTargetCandidate!, 3)).toBe('已有 4 人有空，已满足 3 人发车条件');
    expect(formatCandidateBadge(overTargetCandidate!, 3)).toBe('4 人有空 · 3 人可开');
    const overTargetRoom = { ...baseRoom, submissions: overTargetSubmissions };
    const overTargetMeta = buildRoomShareMeta(overTargetRoom, 'https://game.example.com');
    expect(overTargetMeta.title).toContain('已有 4 人有空，已满足 3 人发车条件');
    expect(overTargetMeta.title).not.toContain('4/3');
    expect(overTargetMeta.description).toContain('已满足 3 人发车条件');
    const overTargetNotice = formatGroupNotice(overTargetRoom, overTargetCandidate!, inviteUrl, false);
    expect(overTargetNotice).toContain('已有 4 人有空，已满足 3 人发车条件');
    expect(overTargetNotice).not.toContain('4/3');
  });

  it('normalizes heat levels dynamically to each night peak count', () => {
    expect([0, 1].map((c) => getHeatLevel(c, 1))).toEqual([0, 1]);
    expect([0, 1, 2].map((c) => getHeatLevel(c, 2))).toEqual([0, 1, 5]);
    expect([0, 1, 2, 3].map((c) => getHeatLevel(c, 3))).toEqual([0, 1, 3, 5]);
    expect([0, 1, 2, 3, 4].map((c) => getHeatLevel(c, 4))).toEqual([0, 1, 2, 4, 5]);
    expect([0, 1, 2, 3, 4, 5].map((c) => getHeatLevel(c, 5))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
