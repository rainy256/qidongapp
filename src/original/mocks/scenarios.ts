import { buildNightWindow, shanghaiToSlot } from '../domain/time';
import type { Night, RoomSnapshot, Slot, Submission } from '../domain/types';

export const DEMO_BASE_DATE = '2026-11-27';
export const DEMO_CLOCK_ISO = '2026-11-27T11:42:00.000Z'; // 19:42 Asia/Shanghai
export const DEMO_EARLIEST_START: Slot = shanghaiToSlot(DEMO_BASE_DATE, 19, 0);

export type DemoScenarioMeta = Readonly<{
  id: string;
  label: string;
  summary: string;
}>;

export const DEMO_SCENARIOS: readonly DemoScenarioMeta[] = [
  { id: 'demo-almost', label: '差我一人（主推）', summary: '塔科夫 4 人就位，选完就 5 人发车' },
  { id: 'demo-ready', label: '已可开（含替补）', summary: 'GTA 周六 5 人有空，4 人发车' },
  { id: 'demo-counterexample', label: '防误报反例', summary: 'GTA 中途换人（2h差1人 / 1h可开）' },
  { id: 'demo-midnight', label: '跨午夜+分段', summary: '塔科夫夜图 22:00–次日01:30' },
  { id: 'demo-closed', label: '已结束收集', summary: 'GTA 豪劫锁场后的只读定稿票' },
  { id: 'demo-empty', label: '空房间', summary: 'Apex 三排刚建房，无人提交态' },
];

export type StoredScenario = Readonly<{
  room: Omit<RoomSnapshot, 'viewer'>;
  ownerMemberId: string;
  sampleMemberId: string | null;
}>;

function slotAt(dateKey: string, h: number, m: 0 | 30 = 0, nextDay = false): Slot {
  return shanghaiToSlot(dateKey, h, m, nextDay);
}

export function createSeedScenarios(): Map<string, StoredScenario> {
  const map = new Map<string, StoredScenario>();

  // 1. Flagship: demo-almost ("差 1 人 -> 算上你就齐了")
  {
    const fri: Night = buildNightWindow('2026-11-27', 19, 0, 1, 0);
    const sat: Night = buildNightWindow('2026-11-28', 19, 0, 1, 0);
    const sun: Night = buildNightWindow('2026-11-29', 19, 0, 23, 30);

    const submissions: Submission[] = [
      {
        memberId: 'u_azhe',
        nickname: '阿哲',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 23, 30) },
            { nightId: sat.id, from: slotAt('2026-11-28', 20, 30), to: slotAt('2026-11-28', 23, 30) },
          ],
        },
        updatedAt: '2026-11-27T11:10:00.000Z',
      },
      {
        memberId: 'u_xiaoman',
        nickname: '小满',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 19, 30), to: slotAt('2026-11-27', 23, 0) },
            { nightId: sun.id, from: slotAt('2026-11-29', 20, 0), to: slotAt('2026-11-29', 22, 30) },
          ],
        },
        updatedAt: '2026-11-27T11:18:00.000Z',
      },
      {
        memberId: 'u_laozhou',
        nickname: '老周',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 23, 0) },
            { nightId: sat.id, from: slotAt('2026-11-28', 20, 0), to: slotAt('2026-11-28', 23, 0) },
          ],
        },
        updatedAt: '2026-11-27T11:25:00.000Z',
      },
      {
        memberId: 'u_qiqi',
        nickname: '七七',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 0, 0, true) },
            { nightId: sun.id, from: slotAt('2026-11-29', 20, 0), to: slotAt('2026-11-29', 23, 0) },
          ],
        },
        updatedAt: '2026-11-27T11:32:00.000Z',
      },
      {
        memberId: 'u_akai',
        nickname: '阿凯',
        answer: { kind: 'unavailable' },
        updatedAt: '2026-11-27T11:35:00.000Z',
      },
    ];

    map.set('demo-almost', {
      room: {
        id: 'demo-almost',
        title: '周五晚塔科夫五人车',
        gameTag: 'tarkov',
        tzid: 'Asia/Shanghai',
        nights: [fri, sat, sun],
        targetPlayers: 5,
        durationSlots: 4,
        roomRevision: 6,
        closedAt: null,
        submissions,
        syncedAt: DEMO_CLOCK_ISO,
      },
      ownerMemberId: 'u_azhe',
      sampleMemberId: 'u_xiaoman',
    });
  }

  // 2. Ready (5 players available for 4-player GTA)
  {
    const sat: Night = buildNightWindow('2026-11-28', 19, 0, 23, 30);
    const sun: Night = buildNightWindow('2026-11-29', 19, 0, 23, 0);

    const submissions: Submission[] = [
      {
        memberId: 'u_cheng',
        nickname: '阿程',
        answer: {
          kind: 'available',
          picks: [
            { nightId: sat.id, from: slotAt('2026-11-28', 20, 0), to: slotAt('2026-11-28', 23, 0) },
            { nightId: sun.id, from: slotAt('2026-11-29', 19, 30), to: slotAt('2026-11-29', 22, 30) },
          ],
        },
        updatedAt: '2026-11-27T10:20:00.000Z',
      },
      {
        memberId: 'u_yoyo',
        nickname: 'Yoyo',
        answer: {
          kind: 'available',
          picks: [
            { nightId: sat.id, from: slotAt('2026-11-28', 20, 0), to: slotAt('2026-11-28', 23, 0) },
            { nightId: sun.id, from: slotAt('2026-11-29', 20, 0), to: slotAt('2026-11-29', 22, 30) },
          ],
        },
        updatedAt: '2026-11-27T10:28:00.000Z',
      },
      {
        memberId: 'u_mumu',
        nickname: '木木',
        answer: {
          kind: 'available',
          picks: [
            { nightId: sat.id, from: slotAt('2026-11-28', 19, 30), to: slotAt('2026-11-28', 23, 30) },
          ],
        },
        updatedAt: '2026-11-27T10:33:00.000Z',
      },
      {
        memberId: 'u_lin',
        nickname: '小林',
        answer: {
          kind: 'available',
          picks: [
            { nightId: sat.id, from: slotAt('2026-11-28', 20, 0), to: slotAt('2026-11-28', 22, 30) },
            { nightId: sun.id, from: slotAt('2026-11-29', 19, 30), to: slotAt('2026-11-29', 22, 0) },
          ],
        },
        updatedAt: '2026-11-27T10:40:00.000Z',
      },
      {
        memberId: 'u_tang',
        nickname: '阿汤',
        answer: {
          kind: 'available',
          picks: [
            { nightId: sat.id, from: slotAt('2026-11-28', 20, 30), to: slotAt('2026-11-28', 23, 0) },
            { nightId: sun.id, from: slotAt('2026-11-29', 19, 30), to: slotAt('2026-11-29', 22, 30) },
          ],
        },
        updatedAt: '2026-11-27T10:51:00.000Z',
      },
    ];

    map.set('demo-ready', {
      room: {
        id: 'demo-ready',
        title: '周末 GTA 抢劫分红车',
        gameTag: 'gta',
        tzid: 'Asia/Shanghai',
        nights: [sat, sun],
        targetPlayers: 4,
        durationSlots: 4,
        roomRevision: 5,
        closedAt: null,
        submissions,
        syncedAt: DEMO_CLOCK_ISO,
      },
      ownerMemberId: 'u_cheng',
      sampleMemberId: 'u_lin',
    });
  }

  // 3. Counterexample: 甲乙丙 20-22, 丁 20-21, 戊 21-22 (4 players)
  {
    const fri: Night = buildNightWindow('2026-11-27', 19, 0, 23, 0);

    const submissions: Submission[] = [
      {
        memberId: 'm_a',
        nickname: '甲',
        answer: {
          kind: 'available',
          picks: [{ nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 22, 0) }],
        },
        updatedAt: '2026-11-27T10:00:00.000Z',
      },
      {
        memberId: 'm_b',
        nickname: '乙',
        answer: {
          kind: 'available',
          picks: [{ nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 22, 0) }],
        },
        updatedAt: '2026-11-27T10:01:00.000Z',
      },
      {
        memberId: 'm_c',
        nickname: '丙',
        answer: {
          kind: 'available',
          picks: [{ nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 22, 0) }],
        },
        updatedAt: '2026-11-27T10:02:00.000Z',
      },
      {
        memberId: 'm_d',
        nickname: '丁',
        answer: {
          kind: 'available',
          picks: [{ nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 21, 0) }],
        },
        updatedAt: '2026-11-27T10:03:00.000Z',
      },
      {
        memberId: 'm_e',
        nickname: '戊',
        answer: {
          kind: 'available',
          picks: [{ nightId: fri.id, from: slotAt('2026-11-27', 21, 0), to: slotAt('2026-11-27', 22, 0) }],
        },
        updatedAt: '2026-11-27T10:04:00.000Z',
      },
    ];

    map.set('demo-counterexample', {
      room: {
        id: 'demo-counterexample',
        title: 'GTA 四人防误报验证（中途换人）',
        gameTag: 'gta',
        tzid: 'Asia/Shanghai',
        nights: [fri],
        targetPlayers: 4,
        durationSlots: 4,
        roomRevision: 5,
        closedAt: null,
        submissions,
        syncedAt: DEMO_CLOCK_ISO,
      },
      ownerMemberId: 'm_a',
      sampleMemberId: 'm_d',
    });
  }

  // 4. Cross-midnight + split intervals
  {
    const fri: Night = buildNightWindow('2026-11-27', 20, 0, 3, 0);
    const sat: Night = buildNightWindow('2026-11-28', 20, 0, 3, 0);

    const submissions: Submission[] = [
      {
        memberId: 'v_1',
        nickname: '南风',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 20, 0), to: slotAt('2026-11-27', 21, 0) },
            { nightId: fri.id, from: slotAt('2026-11-27', 22, 0), to: slotAt('2026-11-27', 2, 0, true) },
          ],
        },
        updatedAt: '2026-11-27T11:00:00.000Z',
      },
      {
        memberId: 'v_2',
        nickname: '阿白',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 22, 0), to: slotAt('2026-11-27', 1, 30, true) },
          ],
        },
        updatedAt: '2026-11-27T11:05:00.000Z',
      },
      {
        memberId: 'v_3',
        nickname: 'Koma',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 22, 0), to: slotAt('2026-11-27', 2, 0, true) },
            { nightId: sat.id, from: slotAt('2026-11-28', 22, 0), to: slotAt('2026-11-28', 2, 0, true) },
          ],
        },
        updatedAt: '2026-11-27T11:12:00.000Z',
      },
      {
        memberId: 'v_4',
        nickname: '小北',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 22, 0), to: slotAt('2026-11-27', 1, 30, true) },
          ],
        },
        updatedAt: '2026-11-27T11:20:00.000Z',
      },
      {
        memberId: 'v_5',
        nickname: '阿九',
        answer: {
          kind: 'available',
          picks: [
            { nightId: fri.id, from: slotAt('2026-11-27', 22, 0), to: slotAt('2026-11-27', 1, 30, true) },
          ],
        },
        updatedAt: '2026-11-27T11:30:00.000Z',
      },
    ];

    map.set('demo-midnight', {
      room: {
        id: 'demo-midnight',
        title: '深夜塔科夫夜图车队',
        gameTag: 'tarkov',
        tzid: 'Asia/Shanghai',
        nights: [fri, sat],
        targetPlayers: 5,
        durationSlots: 5,
        roomRevision: 5,
        closedAt: null,
        submissions,
        syncedAt: DEMO_CLOCK_ISO,
      },
      ownerMemberId: 'v_1',
      sampleMemberId: 'v_2',
    });
  }

  // 5. Closed room
  {
    const fri: Night = buildNightWindow('2026-11-27', 20, 0, 0, 0);
    const sat: Night = buildNightWindow('2026-11-28', 20, 0, 0, 0);

    const submissions: Submission[] = ['阿青', '小林', '老周', '七七'].map((name, idx) => ({
      memberId: `c_${idx + 1}`,
      nickname: name,
      answer: {
        kind: 'available',
        picks: [{ nightId: fri.id, from: slotAt('2026-11-27', 21, 0), to: slotAt('2026-11-27', 23, 30) }],
      },
      updatedAt: '2026-11-27T10:30:00.000Z',
    }));

    map.set('demo-closed', {
      room: {
        id: 'demo-closed',
        title: '上周 GTA 末日豪劫',
        gameTag: 'gta',
        tzid: 'Asia/Shanghai',
        nights: [fri, sat],
        targetPlayers: 4,
        durationSlots: 4,
        roomRevision: 8,
        closedAt: '2026-11-27T11:30:00.000Z',
        submissions,
        syncedAt: DEMO_CLOCK_ISO,
      },
      ownerMemberId: 'c_1',
      sampleMemberId: 'c_2',
    });
  }

  // 6. Empty room
  {
    const fri: Night = buildNightWindow('2026-11-27', 19, 30, 23, 30);
    const sat: Night = buildNightWindow('2026-11-28', 19, 30, 23, 30);

    map.set('demo-empty', {
      room: {
        id: 'demo-empty',
        title: '下周 Apex 三排上分',
        gameTag: 'apex',
        tzid: 'Asia/Shanghai',
        nights: [fri, sat],
        targetPlayers: 3,
        durationSlots: 4,
        roomRevision: 1,
        closedAt: null,
        submissions: [],
        syncedAt: DEMO_CLOCK_ISO,
      },
      ownerMemberId: 'e_owner',
      sampleMemberId: null,
    });
  }

  return map;
}
