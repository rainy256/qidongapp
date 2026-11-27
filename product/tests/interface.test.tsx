// @vitest-environment jsdom
import { act, Profiler, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HomeView } from '../components/HomeView';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { ReservationPanel } from '../features';
import { NetworkMeasurement } from '../network-diagnostics';
import { slotToShanghaiParts } from '../../src/original/domain/time';
import type { RoomSnapshot } from '../../src/original/domain/types';
import type { Snapshot, Reservation } from '../types';

const slotMs = 1800000;
const six = Date.parse('2026-11-27T06:00:00+08:00') / slotMs;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
function render(node: ReactNode) { act(() => root.render(node)); }
function button(text: string) {
  const result = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text));
  if (!result) throw new Error('Missing button: ' + text);
  return result;
}
function click(text: string) { act(() => button(text).click()); }
function select(field: HTMLSelectElement, value: number) {
  act(() => { field.value = String(value); field.dispatchEvent(new Event('change', { bubbles: true })); });
}

it.each([false, true])('预约显式选择过期后保留原值，手动避开冲突后才提交（改期=%s）', async edit => {
  const old = six + 29; // 20:30 Shanghai
  const existing: Reservation = {id:'mine', creator:'m1', title:'Apex', game:'apex', state:'pending',
    from_slot:old + 10, to_slot:old + 12, r1:1, r2:0, r3:0, revision:4};
  const blocked = {...existing, id:'other', from_slot:old + 1, to_slot:old + 3};
  const write = vi.fn(async () => true);
  const panel = (now: number) => <ReservationPanel draft={null} onDraftConsumed={() => {}} now={now} me="m1"
    members={[]} reservations={edit ? [existing, blocked] : [blocked]} notice="" game="apex" custom=""
    candidates={[]} busy={false} write={write}/>;
  render(panel(old * slotMs - 60000));
  if (edit) click('改期');
  const input = host.querySelector<HTMLSelectElement>('#reservation-form .twoColGrid select')!;
  select(input, old);
  render(panel(old * slotMs - 1));
  expect(input.value).toBe(String(old));
  render(panel(old * slotMs));
  expect(input.value).toBe(String(old));
  const submit = host.querySelector<HTMLButtonElement>('#reservation-form [type=submit]')!;
  expect(submit.disabled).toBe(true);
  act(() => submit.click());
  expect(write).not.toHaveBeenCalled();
  click('改选');
  expect(input.value).toBe(String(old + 3));
  await act(async () => submit.click());
  expect(write.mock.calls[0]).toMatchObject([edit ? '/api/reservations/mine/change' : '/api/reservations',
    expect.objectContaining({from:old + 3, to:old + 5, ...(edit && {revision:4})}), !edit, expect.any(String)]);
});

it('预约默认值随时钟推进，跨六点保留已选值，末日按时长校验', () => {
  const now = (six + 48) * slotMs;
  const panel = (t: number) => <ReservationPanel draft={null} onDraftConsumed={() => {}} now={t} me="m1"
    members={[]} reservations={[]} notice="" game="apex" custom="" candidates={[]} busy={false} write={vi.fn()}/>;
  render(panel(now - 60000));
  const input = host.querySelector<HTMLSelectElement>('.twoColGrid select')!;
  expect(input.value).toBe(String(six + 48));
  render(panel(now));
  expect(input.value).toBe(String(six + 49));
  select(input, six + 49);
  render(panel(now + slotMs));
  expect(input.value).toBe(String(six + 49));
  act(() => host.querySelectorAll<HTMLButtonElement>('[aria-label="预约日期"] button')[6].click());
  select(input, six + 48 + 335);
  expect(host.querySelector<HTMLButtonElement>('#reservation-form [type=submit]')!.disabled).toBe(true);
});

function schedule(day: number, revision: number): RoomSnapshot {
  const nights = Array.from({length:7}, (_, i) => {
    const from = day + i * 48;
    const dateKey = slotToShanghaiParts(from).dateKey;
    return { id:dateKey, dateKey, from, to:from + 48 };
  });
  return { id:nights[0].id, title:'日程', tzid:'Asia/Shanghai', nights, targetPlayers:3, durationSlots:2,
    roomRevision:revision, closedAt:null, syncedAt:new Date(day * slotMs).toISOString(),
    viewer:{memberId:'m1', canClose:false, mineRevision:revision}, submissions:[] };
}
it('快捷填充确认、切页、窗口滚动和异设备更新均保留仍有效的草稿及原 revision', async () => {
  const save = vi.fn(async () => false);
  function Editor({day, revision, visible}: {day: number; revision: number; visible: boolean}) {
    const [dirty, setDirty] = useState(false);
    return <ScheduleEditor visible={visible} isDirty={dirty} setIsDirty={setDirty} snapshot={schedule(day, revision)}
      explicitlyUnavailable={false} earliestStart={day + 1} isSaving={false} saveError={null}
      onSave={save} onClearError={() => {}} onRefreshLatest={async () => false}/>;
  }
  const panel = (day = six, revision = 1, visible = true) => <Editor day={day} revision={revision} visible={visible}/>;
  render(panel());
  const tabs = () => host.querySelectorAll<HTMLButtonElement>('[aria-label="选择日期"] button');
  const starts = () => [...host.querySelectorAll<HTMLSelectElement>('select[id^="from-"]')];
  select(starts()[0], six + 5);
  act(() => tabs()[1].click());
  select(starts()[0], six + 52);
  click('加第二段');
  select(starts()[1], six + 58);
  click('全天都有空');
  expect(host.querySelector('dialog[open]')).toBeTruthy();
  click('保留原时段');
  expect(starts().map(s => s.value)).toEqual([six + 52, six + 58].map(String));
  click('全天都有空');
  click('替换时段');
  expect(starts().map(s => s.value)).toEqual([String(six + 48)]);
  click('全天都有空');
  expect(host.querySelector('dialog[open]')).toBeNull();
  act(() => tabs()[0].click());
  expect(starts()[0].value).toBe(String(six + 5));
  render(panel(six, 1, false));
  expect(starts()).toHaveLength(0);
  render(panel(six + 48, 2));
  expect(starts()[0].value).toBe(String(six + 48));
  expect(host.textContent).toContain('其他设备已更新');
  await act(async () => button('保存我的时间').click());
  expect(save).toHaveBeenCalledWith({kind:'available', picks:[{nightId:slotToShanghaiParts(six + 48).dateKey,
    from:six + 49, to:six + 96}]}, 1, false);
});

it('整周没空的草稿跨日后须确认扩展进来的日期', async () => {
  const save = vi.fn(async () => true);
  function Editor({ day }: { day: number }) {
    const [dirty, setDirty] = useState(false);
    return <ScheduleEditor visible isDirty={dirty} setIsDirty={setDirty} snapshot={schedule(day, 3)}
      explicitlyUnavailable={false} earliestStart={day} isSaving={false} saveError={null}
      onSave={save} onClearError={() => {}} onRefreshLatest={async () => true}/>;
  }
  render(<Editor day={six}/>);
  click('都没空');
  render(<Editor day={six + 48}/>);
  const submit = button('确认都没空');
  expect(submit.disabled).toBe(true);
  click('确认新范围');
  await act(async () => submit.click());
  expect(save).toHaveBeenCalledWith({kind:'unavailable'}, 3, true);
});

const homeSnap: Snapshot = { now:six * slotMs, clientClock:0, me:{id:'m1',nickname:'A'},
  members:[{id:'m1',nickname:'A',last_seen:null,schedule:[],schedule_revision:1}],
  invites:[], reservations:[], nudges:[], messages:[], reservationMessages:[] };
it('空闲首页一分钟只更新一次，同步年龄、到期边界和前后台状态正确', () => {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','performance']});
  const commits = vi.fn();
  const pane = (snap: Snapshot, active = true) => <Profiler id="home" onRender={commits}><HomeView snap={snap}
    active={active} reconnecting game="apex" custom="" busy={false} busyKey={null}
    onGameChange={() => {}} onCustomChange={() => {}} candidates={[]} onRebook={() => {}} write={vi.fn()}/></Profiler>;
  render(pane(homeSnap));
  commits.mockClear();
  for (let i = 0; i < 120; i++) act(() => vi.advanceTimersByTime(500));
  expect(commits).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('1 分钟前同步');
  const snap = {...homeSnap, members:[{...homeSnap.members[0], available_until:homeSnap.now+61123, last_seen:homeSnap.now}],
    invites:[{id:'demo',creator:'m1',game:'apex' as const,title:'Apex',created_at:homeSnap.now,expires_at:homeSnap.now+65000,
      revision:1,r1:'5',r1_eta:homeSnap.now+63000,r2:'pending',r3:'pending',status:'pending' as const}]};
  render(pane(snap));
  act(() => vi.advanceTimersByTime(1123));
  expect(host.textContent).toContain('未表态');
  act(() => vi.advanceTimersByTime(1877));
  expect(host.textContent).toContain('待本人确认');
  act(() => vi.advanceTimersByTime(2000));
  expect(host.textContent).toContain('历史已过期车票');
  render(pane(snap, false));
  commits.mockClear();
  act(() => vi.advanceTimersByTime(30000));
  expect(commits).not.toHaveBeenCalled();
  render(pane(snap));
  expect(host.textContent).toContain('未近期活跃');
});

it('本机测量仅用重连后的新请求计时，读取与写入样本各自有界', () => {
  vi.useFakeTimers({toFake:['performance']});
  const run = new NetworkMeasurement();
  run.connectivity(false);
  vi.advanceTimersByTime(40);
  run.connectivity(true);
  vi.advanceTimersByTime(5);
  run.connectivity(true);
  run.finish('read', 0, true);
  expect(run.reconnects).toEqual([]);
  vi.advanceTimersByTime(10);
  run.finish('read',45,true,true);
  run.finish('save',45,false,false,new DOMException('Timeout','AbortError'));
  expect(run.reconnects).toEqual([15]);
  expect(run.samples.save[0]).toMatchObject({ms:10,timeout:true,ok:false});
  expect(run.samples.read[1].backup).toBe(true);
  for (let i = 0; i < 105; i++) run.finish('read',50,true);
  expect(run.samples.read).toHaveLength(100);
});
