import { useEffect, useState } from 'react';

const REPO = 'https://github.com/shubhusion/Permiscope';
const NPM = 'https://www.npmjs.com/package/permiscope';
const CONSOLE = '#/console/overview';

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
        return response.json() as Promise<{ eval: { passed: number; total: number }; chain: { valid: boolean } }>;
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
    body: 'Sensitive actions pause for a human. Requests carry identity and TTL, replay safely, and can be decided from the CLI, the dashboard or the sidecar.',
  },
  {
    number: '03',
    title: 'Signed evidence',
    body: 'Every intent and result is written before and after execution, linked by hash and HMAC. Segment heads make tail truncation visible to verifiers.',
  },
  {
    number: '04',
    title: 'One gate, many runtimes',
    body: 'Call the TypeScript adapter, the language-agnostic HTTP sidecar, or the MCP tool wrapper. The same policy engine and audit path govern all three.',
  },
  {
    number: '05',
    title: 'Measured, not asserted',
    body: 'A versioned corpus of adversarial actions runs on every CI job. The public numbers on this page are read from the generated fixture, not typed in by hand.',
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
          <a href="#start">Quick start</a>
          <a href="#evidence">Evidence</a>
          <a href={CONSOLE}>Console</a>
          <a className="nav-github" href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">COOPERATIVE GOVERNANCE · NOT A SANDBOX</p>
            <h1>
              Governed <em>side effects</em><br />for cooperative agents.
            </h1>
            <p className="hero-lede">
              Permiscope mediates the real-world actions of autonomous agents: verified
              principals, executable policy, human approval, and a signed audit trail —
              in one small library you can run today.
            </p>
            <div className="hero-actions">
              <a className="btn-primary" href={CONSOLE}>OPEN THE CONSOLE <span aria-hidden="true">→</span></a>
              <a className="btn-ghost" href={`${REPO}#readme`} target="_blank" rel="noreferrer">READ THE DOCS</a>
            </div>
            <p className="hero-note">
              Cooperative governance, not a sandbox. It governs what passes through its
              gateway; it does not isolate a process.{' '}
              <a href={`${REPO}/blob/main/docs/adr/0001-cooperative-governance-boundary.md`} target="_blank" rel="noreferrer">See ADR-0001 ↗</a>
            </p>
          </div>

          <div className="hero-visual" aria-label="Example policy decisions">
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
            <a className="btn-ghost" href={`${REPO}/blob/main/docs/limitations.md`} target="_blank" rel="noreferrer">LIMITATIONS</a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>PERMISCOPE · COOPERATIVE GOVERNANCE</span>
        <span>
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
