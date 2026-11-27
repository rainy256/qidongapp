type Sample = { ms: number; ok: boolean; timeout: boolean; backup: boolean };
type Operation = 'read' | 'save';
const limit = 100;

export class NetworkMeasurement {
  samples: Record<Operation, Sample[]> = { read: [], save: [] };
  reconnects: number[] = [];
  private offline = false;
  private reconnectedAt: number | null = null;

  connectivity(connected: boolean) {
    if (!connected) this.reconnectedAt = null;
    if (connected && this.offline) this.reconnectedAt = performance.now();
    this.offline = !connected;
  }

  finish(operation: Operation, started: number, ok: boolean, backup = false, error?: unknown) {
    const now = performance.now();
    const rows = this.samples[operation];
    rows.push({ ms: now - started, ok, backup, timeout: typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError' });
    if (rows.length > limit) rows.shift();
    if (operation === 'read' && ok && this.reconnectedAt !== null && started >= this.reconnectedAt) {
      this.reconnects.push(now - this.reconnectedAt);
      if (this.reconnects.length > limit) this.reconnects.shift();
      this.reconnectedAt = null;
    }
  }
}

function seconds(ms: number) { return (ms / 1000).toFixed(2) + ' 秒'; }

function latency(values: number[]) {
  if (!values.length) return '暂无成功样本';
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (p: number) => seconds(sorted[Math.ceil(sorted.length * p) - 1]);
  return `P50 ${quantile(0.5)}，P95 ${quantile(0.95)}`;
}

function rate(count: number, total: number) {
  return total ? `${count}/${total}（${Math.round(count * 100 / total)}%）` : '暂无样本';
}

export function NetworkDiagnostics({ active, report: run, onToggle }: {
  active: boolean;
  report: NetworkMeasurement | null;
  onToggle: () => void;
}) {
  return <details className="disclosureCard">
    <summary className="disclosureSummary">网络耗时诊断</summary>
    <div className="disclosureBody stackForm">
      <p className="helperText">在同一种网络下开始测量，然后照常刷新小队或保存日程。每项保留最近 100 次，本次记录仅在设备内存中。</p>
      <button type="button" className="btnGhostSm" onClick={onToggle}>{active ? '结束测量' : '开始新测量'}</button>
      {run && <div>
        {(['read', 'save'] as const).map(op => {
          const rows = run.samples[op];
          const successes = rows.filter(r => r.ok);
          return <p className="helperText" key={op}><strong>{op === 'read' ? '小队读取' : '日程保存'}</strong>
            {' · '}成功 {successes.length}/{rows.length} · {latency(successes.map(r => r.ms))}
            {' · '}客户端超时 {rate(rows.filter(r => r.timeout).length, rows.length)}
            {op === 'read' && ' · 启用备用线路 ' + rate(rows.filter(r => r.backup).length, rows.length)}
          </p>;
        })}
        <p className="helperText">网络恢复到首次成功补刷（{run.reconnects.length} 次） · {latency(run.reconnects)}</p>
      </div>}
    </div>
  </details>;
}
