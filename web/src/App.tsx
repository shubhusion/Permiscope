import { useCallback, useEffect, useState } from 'react';
import {
  ApprovalView,
  DashboardData,
  DashboardDataSource,
  FixtureDataSource,
  HttpDataSource,
  LogView,
} from './data';

const DEMO = import.meta.env.VITE_DEMO_MODE !== 'false';
const TABS = ['overview', 'approvals', 'logs', 'chain', 'eval', 'scenario'] as const;
type Tab = (typeof TABS)[number];

function useHashTab(): [Tab, (tab: Tab) => void] {
  const read = (): Tab => {
    const value = window.location.hash.replace('#/', '') as Tab;
    return TABS.includes(value) ? value : 'overview';
  };
  const [tab, setTabState] = useState<Tab>(read);
  useEffect(() => {
    const handler = () => setTabState(read());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return [tab, (next: Tab) => { window.location.hash = `#/${next}`; }];
}

function Ttl({ approval }: { approval: ApprovalView }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (approval.ttlSeconds !== undefined) {
    return <span>TTL {Math.floor(approval.ttlSeconds / 60)}m</span>;
  }
  if (!approval.expiresAt) return <span>TTL —</span>;
  const seconds = Math.max(0, Math.round((new Date(approval.expiresAt).getTime() - now) / 1000));
  return <span>TTL {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>;
}

function Head({ data, token, setToken, reload }: {
  data: DashboardData | null;
  token: string;
  setToken: (value: string) => void;
  reload: () => void;
}) {
  return (
    <header className="topbar">
      <div className="mark" aria-hidden="true">P</div>
      <div>
        <h1 className="brand-name">PERMISCOPE</h1>
        <div className="brand-sub">GOVERNANCE CONSOLE / MEDIATED AGENCY</div>
      </div>
      <div className="spacer" />
      {!DEMO && (
        <input
          className="token-input"
          type="password"
          aria-label="Dashboard bearer token"
          placeholder="Dashboard token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      )}
      <span className={`chip ${DEMO ? 'demo' : 'ok'}`}>{DEMO ? 'DEMO DATA' : 'LIVE'}</span>
      {data && (
        <span className={`chip ${data.chain.valid ? 'ok' : ''}`}>
          CHAIN {data.chain.valid ? 'VALID' : 'INVALID'}
        </span>
      )}
      <button className="btn" onClick={reload} aria-label="Reload data">RELOAD</button>
    </header>
  );
}

function Nav({ tab, select }: { tab: Tab; select: (tab: Tab) => void }) {
  return (
    <nav className="sidebar" aria-label="Console sections">
      {TABS.map((item, index) => (
        <button
          key={item}
          className={`nav-item ${tab === item ? 'active' : ''}`}
          onClick={() => select(item)}
          aria-current={tab === item ? 'page' : undefined}
        >
          <span className="nav-index">0{index + 1}</span>
          {item.toUpperCase()}
        </button>
      ))}
      <div className="sidebar-foot">
        Permiscope v1.1.0
        <br />
        Cooperative governance, not a sandbox.
      </div>
    </nav>
  );
}

function PageHead({ title, subtitle, eyebrow = 'CONSOLE' }: { title: string; subtitle: string; eyebrow?: string }) {
  return (
    <div className="page-head">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p className="page-sub">{subtitle}</p>
    </div>
  );
}

function Overview({ data }: { data: DashboardData }) {
  const pending = data.approvals.filter((item) => item.status === 'PENDING').length;
  return (
    <>
      <PageHead title="Overview" subtitle="Governance posture at a glance." eyebrow="SITUATION REPORT" />
      <div className="grid three">
        <section className="panel">
          <h2 className="panel-title">Adversarial eval</h2>
          <div className="metric">{Math.round(data.eval.passRate)}%</div>
          <div className="metric-label">
            {data.eval.passed}/{data.eval.total} cases · corpus v{data.eval.version}
          </div>
          <div className="bar"><span style={{ width: `${data.eval.passRate}%` }} /></div>
        </section>
        <section className="panel">
          <h2 className="panel-title">Audit chain</h2>
          <div className="metric" style={{ color: data.chain.valid ? 'var(--green)' : 'var(--red)' }}>
            {data.chain.valid ? 'OK' : 'FAIL'}
          </div>
          <div className="metric-label">
            {data.chain.entries} entries · sequence + head anchor
          </div>
          <div className="bar"><span style={{ width: '100%', background: data.chain.valid ? 'var(--green)' : 'var(--red)' }} /></div>
        </section>
        <section className="panel">
          <h2 className="panel-title">Approval queue</h2>
          <div className="metric" style={{ color: 'var(--cyan)' }}>{pending}</div>
          <div className="metric-label">Pending human decisions</div>
          <div className="bar"><span style={{ width: `${Math.min(100, pending * 25)}%`, background: 'var(--cyan)' }} /></div>
        </section>
      </div>
      <div className="grid two" style={{ marginTop: 18 }}>
        <section className="panel">
          <h2 className="panel-title">Latest governed actions</h2>
          {data.logs.slice(-5).reverse().map((log, index) => (
            <div className="kv" key={`${log.sequence}-${index}`}>
              <span>{log.timestamp.slice(11, 19)} {log.actionName}</span>
              <span className={`status-${log.decision}`}>{log.decision}</span>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2 className="panel-title">Trust boundaries</h2>
          <div className="kv"><span>Mediation</span><span>policy → approval → execution</span></div>
          <div className="kv"><span>Identity</span><span>principal provider</span></div>
          <div className="kv"><span>Audit</span><span>HMAC + key rotation</span></div>
          <div className="kv"><span>Sidecar</span><span>loopback + bearer token</span></div>
          <div className="kv"><span>Isolation</span><span>OS-level required</span></div>
        </section>
      </div>
    </>
  );
}

function Approvals({ data, onDecide }: { data: DashboardData; onDecide: (id: string, status: 'APPROVED' | 'REJECTED') => void }) {
  const pending = data.approvals.filter((item) => item.status === 'PENDING');
  return (
    <>
      <PageHead title="Approvals" subtitle="Human-in-the-loop decisions, ordered by urgency." eyebrow="CONTROL PLANE" />
      {pending.length === 0 ? (
        <section className="panel"><p className="loading">No pending approvals.</p></section>
      ) : (
        <section className="panel">
          <h2 className="panel-title">Pending requests</h2>
          {pending.map((item) => (
            <article className="approval" key={item.id}>
              <div className="approval-head">
                <strong>{item.actionName}</strong>
                <span className="tag status-REQUIRE_APPROVAL">{item.status}</span>
                <span style={{ color: 'var(--muted)' }}>{item.agentId}</span>
                <span className="spacer" />
                <Ttl approval={item} />
              </div>
              <pre>{JSON.stringify(item.params, null, 2)}</pre>
              <div className="actions">
                <button
                  className="btn approve"
                  disabled={DEMO}
                  title={DEMO ? 'Read-only demo' : 'Approve this action'}
                  onClick={() => onDecide(item.id, 'APPROVED')}
                >
                  Approve
                </button>
                <button
                  className="btn reject"
                  disabled={DEMO}
                  title={DEMO ? 'Read-only demo' : 'Reject this action'}
                  onClick={() => onDecide(item.id, 'REJECTED')}
                >
                  Reject
                </button>
                {DEMO && <span style={{ color: 'var(--muted)' }}>Read-only showcase</span>}
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function Logs({ logs, select }: { logs: LogView[]; select: (log: LogView) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const decisions = ['ALL', 'ALLOW', 'BLOCK', 'REQUIRE_APPROVAL', 'SHADOW_BLOCK'];
  const visible = logs.filter((log) => {
    const matchesFilter = filter === 'ALL' || log.decision === filter;
    const haystack = `${log.actionName} ${log.agentId} ${JSON.stringify(log.parameters)}`.toLowerCase();
    return matchesFilter && haystack.includes(search.toLowerCase());
  });
  return (
    <>
      <PageHead title="Audit stream" subtitle="Every governed action, with its decision and signature." eyebrow="EVIDENCE" />
      <section className="panel">
        <div className="controls">
          <input
            className="search"
            type="search"
            placeholder="Search actions, agents, parameters…"
            aria-label="Search audit log"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {decisions.map((decision) => (
            <button
              key={decision}
              className={`btn ${filter === decision ? 'approve' : ''}`}
              onClick={() => setFilter(decision)}
            >
              {decision}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="loading">No matching entries.</p>
        ) : (
          visible.map((log, index) => (
            <div
              className="log-row"
              role="button"
              tabIndex={0}
              key={`${log.sequence}-${index}`}
              onClick={() => select(log)}
              onKeyDown={(event) => { if (event.key === 'Enter') select(log); }}
            >
              <span className="log-time">#{log.sequence ?? '-'} {log.timestamp.slice(11, 19)}</span>
              <span className={`log-action status-${log.decision}`}>{log.decision}</span>
              <span className="log-params">{log.actionName} · {JSON.stringify(log.parameters)}</span>
              <span>{log.success ? '✓' : '✗'}</span>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function Drawer({ log, close }: { log: LogView; close: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);
  return (
    <aside className="drawer" role="dialog" aria-modal="true" aria-label="Audit entry detail">
      <div className="drawer-head">
        <h2 style={{ fontFamily: 'var(--display)' }}>ENTRY #{log.sequence ?? '-'}</h2>
        <button className="btn" onClick={close}>CLOSE</button>
      </div>
      <p className={`tag status-${log.decision}`}>{log.decision}</p>
      <div className="kv"><span>Agent</span><span>{log.agentId}</span></div>
      <div className="kv"><span>Timestamp</span><span>{log.timestamp}</span></div>
      <div className="kv"><span>Result</span><span>{log.success ? 'success' : 'failed'}</span></div>
      <h3 className="panel-title" style={{ marginTop: 24 }}>Parameters</h3>
      <pre>{JSON.stringify(log.parameters, null, 2)}</pre>
      <h3 className="panel-title">Signature</h3>
      <pre>{log.signature ?? 'unsigned (development)'}</pre>
    </aside>
  );
}

function Chain({ data }: { data: DashboardData }) {
  return (
    <>
      <PageHead title="Audit chain" subtitle="Integrity checks over the recorded action log." eyebrow="VERIFICATION" />
      <div className="grid two">
        <section className="panel">
          <h2 className="panel-title">Chain status</h2>
          <div className="metric" style={{ color: data.chain.valid ? 'var(--green)' : 'var(--red)' }}>
            {data.chain.valid ? 'VALID' : 'INVALID'}
          </div>
          <div className="metric-label">{data.chain.entries} recorded entries</div>
          {data.chain.errors && data.chain.errors.length > 0 && (
            <ul className="check-list">
              {data.chain.errors.map((error, index) => <li className="bad" key={index}>{error}</li>)}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2 className="panel-title">Checks performed</h2>
          <ul className="check-list">
            {data.chain.checks.map((check) => <li key={check}>{check}</li>)}
          </ul>
          <pre>npm run audit:verify</pre>
        </section>
      </div>
    </>
  );
}

function EvalPanel({ data }: { data: DashboardData }) {
  return (
    <>
      <PageHead title="Adversarial eval" subtitle="A versioned corpus of attacks with expected decisions." eyebrow="MEASUREMENT" />
      <section className="panel">
        <h2 className="panel-title">Corpus v{data.eval.version}</h2>
        <div className="metric">{data.eval.passed}/{data.eval.total}</div>
        <div className="metric-label">{data.eval.passRate.toFixed(1)}% pass rate · reproducible with npm run eval</div>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <h2 className="panel-title">By category</h2>
        {Object.entries(data.eval.byCategory).map(([category, result]) => (
          <div className="category-row" key={category}>
            <span>{category}</span>
            <div className="bar"><span style={{ width: `${(result.passed / result.total) * 100}%` }} /></div>
            <span>{result.passed}/{result.total}</span>
          </div>
        ))}
      </section>
    </>
  );
}

function Scenario({ steps }: { steps: DashboardData['scenario'] }) {
  return (
    <>
      <PageHead title="Rogue agent" subtitle="Recorded end-to-end scenario with stub executors." eyebrow="RECONSTRUCTION" />
      <section className="panel">
        <h2 className="panel-title">Execution timeline</h2>
        {steps.map((step, index) => (
          <div className="step" key={index}>
            <span className="step-num">0{index + 1}</span>
            <div>
              <strong>{step.name}</strong>
              <div style={{ color: 'var(--muted)' }}>
                {step.actionName} · {JSON.stringify(step.parameters)}
              </div>
            </div>
            <span className={`tag status-${step.actual}`}>{step.actual}</span>
          </div>
        ))}
      </section>
    </>
  );
}

export default function App() {
  const [tab, selectTab] = useHashTab();
  const [source] = useState<DashboardDataSource>(() => (DEMO ? new FixtureDataSource() : new HttpDataSource()));
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [token, setTokenState] = useState('');
  const [selected, setSelected] = useState<LogView | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await source.load());
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [source]);

  useEffect(() => {
    void reload();
    if (DEMO) return;
    const timer = setInterval(() => void reload(), 15000);
    return () => clearInterval(timer);
  }, [reload]);

  const setToken = (value: string) => {
    setTokenState(value);
    source.setToken(value);
    void reload();
  };

  const decide = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await source.decide(id, status);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <>
      <Head data={data} token={token} setToken={setToken} reload={() => void reload()} />
      <div className="shell">
        <Nav tab={tab} select={selectTab} />
        <main className="main">
          {error && <div className="notice" role="alert">{error}</div>}
          {!data ? (
            <p className="loading">Loading governance data…</p>
          ) : (
            <>
              {tab === 'overview' && <Overview data={data} />}
              {tab === 'approvals' && <Approvals data={data} onDecide={(id, status) => void decide(id, status)} />}
              {tab === 'logs' && <Logs logs={data.logs} select={setSelected} />}
              {tab === 'chain' && <Chain data={data} />}
              {tab === 'eval' && <EvalPanel data={data} />}
              {tab === 'scenario' && <Scenario steps={data.scenario} />}
            </>
          )}
        </main>
      </div>
      {selected && <Drawer log={selected} close={() => setSelected(null)} />}
    </>
  );
}
