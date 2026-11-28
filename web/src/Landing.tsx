import { useEffect, useState } from 'react';

const REPO = 'https://github.com/shubhusion/Permiscope';
const NPM = 'https://www.npmjs.com/package/permiscope';
const CONSOLE = '#/console/overview';
const DOCS = `${REPO}/blob/main/docs/README.md`;
const HOOKS = `${REPO}/blob/main/docs/hooks.md`;

interface FixtureStats {
  passed: number;
  total: number;
  chainValid: boolean;
}

function useFixtureStats(): FixtureStats | null {
  const [stats, setStats] = useState<FixtureStats | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}fixtures/demo.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Fixture unavailable: ${response.status}`);
        return response.json() as Promise<{
          eval: { passed: number; total: number };
          chain: { valid: boolean };
        }>;
      })
      .then((fixture) => {
        if (active) {
          setStats({
            passed: fixture.eval.passed,
            total: fixture.eval.total,
            chainValid: fixture.chain.valid,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return stats;
}

const FEATURES = [
  {
    number: '01',
    title: 'Policy as code',
    body: 'Typed scopes decide ALLOW, BLOCK or REQUIRE_APPROVAL. Paths are canonical and contained; commands are parsed and matched against an executable allowlist — never a shell string.',
  },
  {
    number: '02',
    title: 'Approvals that expire',
    body: 'Sensitive actions pause for a human. Grants are single-use and TTL-bound, so one decision never becomes an hour of silent replays.',
  },
  {
    number: '03',
    title: 'Signed evidence',
    body: 'Every intent and result is written before and after execution, linked by hash and HMAC. Segment heads make tail truncation visible to verifiers.',
  },
  {
    number: '04',
    title: 'One gate, many runtimes',
    body: 'Use the TypeScript adapter, the HTTP sidecar, the MCP wrapper, or native hooks. The same policy engine decides in every runtime.',
  },
  {
    number: '05',
    title: 'Measured, not asserted',
    body: 'A versioned corpus of adversarial actions runs on every CI job. The public numbers on this page are read from the generated fixture, not typed in by hand.',
  },
];

const HOSTS = [
  {
    name: 'Claude Code',
    command: 'permiscope hook',
    note: 'PreToolUse decisions for Bash, Write, Edit and Read.',
    href: `${HOOKS}#claude-code`,
  },
  {
    name: 'Cursor',
    command: 'permiscope hook cursor',
    note: 'Shell, file and MCP hooks with fail-closed verdicts.',
    href: `${HOOKS}#cursor`,
  },
  {
    name: 'Codex',
    command: 'permiscope hook codex',
    note: 'PreToolUse and PermissionRequest; approvals stay native.',
    href: `${HOOKS}#codex`,
  },
];

const DECISIONS = [
  { verb: 'run_command', detail: 'npm test', outcome: 'ALLOW', tone: 'allow' },
  { verb: 'write_file', detail: '/etc/passwd', outcome: 'GUARDRAIL_PATH', tone: 'block' },
  { verb: 'run_command', detail: 'curl -d @id_rsa', outcome: 'BLOCK', tone: 'block' },
];

export default function Landing() {
  const stats = useFixtureStats();

  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="#/">
          <span className="mark" aria-hidden="true">P</span>
          <span className="brand-name">PERMISCOPE</span>
        </a>
        <nav aria-label="Landing sections">
          <a href="#how">How it works</a>
          <a href="#hosts">Hooks</a>
          <a href="#start">Quick start</a>
          <a href="#evidence">Evidence</a>
          <a href={CONSOLE}>Console</a>
          <a className="nav-github" href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">POLICY · APPROVAL · SIGNED EVIDENCE</p>
            <h1>
              Governed <em>side effects</em><br />for cooperative agents.
            </h1>
            <p className="hero-lede">
              Permiscope is the gate between your agent and the real world. Every command,
              file write and API call is checked against policy, paused for a human when it
              matters, and recorded with signed evidence.
            </p>
            <div className="hero-actions">
              <a className="btn-primary" href={CONSOLE}>TRY THE LIVE CONSOLE <span aria-hidden="true">→</span></a>
              <a className="btn-ghost" href="#start">SEE THE QUICK START</a>
            </div>
            <p className="hero-note">
              Cooperative governance, not a sandbox: it governs actions routed through its
              gateway and cannot stop direct <code>fs</code> calls or spawned processes.{' '}
              <a href={`${REPO}/blob/main/docs/adr/0001-cooperative-governance-boundary.md`} target="_blank" rel="noreferrer">See ADR-0001 ↗</a>
            </p>
          </div>

          <div
            className="hero-visual"
            role="img"
            aria-label="Example policy decisions: npm test is allowed, writing to /etc/passwd is blocked, and a curl upload is blocked"
          >
            <div className="scope-card">
              <div className="scope-head">
                <span>POLICY EVALUATION</span>
                <span className="scope-id">default@scope-02</span>
              </div>
              {DECISIONS.map((row, index) => (
                <div className={`decision-row reveal-${index + 1}`} key={row.detail}>
                  <span className="decision-verb">{row.verb}</span>
                  <code className="decision-detail">{row.detail}</code>
                  <span className={`decision-outcome ${row.tone}`}>{row.outcome}</span>
                </div>
              ))}
              <div className="scope-foot">
                <span className="pulse" aria-hidden="true" />
                <span>{stats ? `${stats.passed}/${stats.total} eval cases` : 'loading eval…'}</span>
                <span className="scope-divider" />
                <span>{stats ? (stats.chainValid ? 'chain verified' : 'chain invalid') : 'verifying…'}</span>
              </div>
              <span className="scanline" aria-hidden="true" />
            </div>
            <div className="scope-stamp" aria-hidden="true">SIGNED EVIDENCE</div>
          </div>
        </section>

        <section className="stat-strip" id="evidence" aria-label="Live project evidence">
          <div>
            <strong>{stats ? `${stats.passed}/${stats.total}` : '—'}</strong>
            <span>adversarial cases passing in CI</span>
          </div>
          <div>
            <strong>{stats ? (stats.chainValid ? 'VALID' : 'INVALID') : '—'}</strong>
            <span>audit chain in the public fixture</span>
          </div>
          <div>
            <strong>MIT</strong>
            <span>open source, no phone-home</span>
          </div>
        </section>

        <section className="features" id="how">
          <div className="section-head">
            <p className="eyebrow">WHAT YOU GET</p>
            <h2>A gate, not a promise.</h2>
            <p>Each layer is small enough to audit and strict enough to matter.</p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((feature, index) => (
              <article className={`feature reveal-${(index % 3) + 1}`} key={feature.number}>
                <span className="feature-number">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="hosts" id="hosts">
          <div className="section-head">
            <p className="eyebrow">NATIVE INTEGRATIONS</p>
            <h2>Works with the agent you already use.</h2>
            <p>Three host adapters, one evaluator, one set of decisions. No policy logic is duplicated.</p>
          </div>
          <div className="host-grid">
            {HOSTS.map((host, index) => (
              <a className={`host-card reveal-${index + 1}`} href={host.href} key={host.name} target="_blank" rel="noreferrer">
                <span className="host-index">0{index + 1}</span>
                <h3>{host.name}</h3>
                <code>{host.command}</code>
                <p>{host.note}</p>
                <span className="host-link" aria-hidden="true">SETUP ↗</span>
              </a>
            ))}
          </div>
        </section>

        <section className="quickstart" id="start">
          <div className="quickstart-copy">
            <p className="eyebrow">QUICK START</p>
            <h2>One import. One gate.</h2>
            <p>
              Install the package, point your agent's executable actions at the adapter,
              and let the default policy deny everything that is not explicitly safe.
            </p>
            <a className="btn-ghost" href={`${REPO}#integration-guide`} target="_blank" rel="noreferrer">FULL INTEGRATION GUIDE ↗</a>
          </div>
          <div className="code-panel">
            <div className="code-head"><span>TERMINAL</span><span>node 24+</span></div>
            <pre><code>{`npm install permiscope

import { PermiscopeAdapter } from 'permiscope';

const gate = new PermiscopeAdapter();

const content = await gate.act('run_command', {
  command: 'echo hello',
});
// -> "hello"`}</code></pre>
          </div>
        </section>

        <section className="closing">
          <p className="eyebrow">BUILT IN THE OPEN</p>
          <h2>Make your agent's actions reviewable.</h2>
          <p>Read the code, run the eval corpus, and bring the gate into your own loop.</p>
          <div className="hero-actions">
            <a className="btn-primary" href={REPO} target="_blank" rel="noreferrer">STAR ON GITHUB <span aria-hidden="true">↗</span></a>
            <a className="btn-ghost" href={NPM} target="_blank" rel="noreferrer">VIEW ON NPM</a>
            <a className="btn-ghost" href={`${REPO}/labels/good%20first%20issue`} target="_blank" rel="noreferrer">FIND A FIRST ISSUE</a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>PERMISCOPE · COOPERATIVE GOVERNANCE</span>
        <span>
          <a href={DOCS} target="_blank" rel="noreferrer">Docs</a>
          {' · '}
          <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">Security</a>
          {' · '}
          <a href={`${REPO}/blob/main/docs/adr/README.md`} target="_blank" rel="noreferrer">Decisions</a>
          {' · '}
          <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">Contributing</a>
        </span>
      </footer>
    </div>
  );
}
