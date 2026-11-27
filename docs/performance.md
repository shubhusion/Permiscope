# Performance

Permiscope's overhead is dominated by path resolution and file locking, not policy logic.

Run locally with:

```bash
npm run bench
```

Reference numbers from a development Windows machine (Node 24, 500–2000 iterations,
stub executors and logger; not a formal benchmark):

| Operation | Throughput | Notes |
|---|---|---|
| `PolicyEngine.evaluate()` on a path-guarded action | ~10,000 decisions/sec | Includes `realpathSync` per check |
| `ExecutionGateway.run()` with stub executor | ~10,000 actions/sec | Includes policy + audit call |
| Gateway overhead | ~0.10 ms/action | Excludes real executor cost |

Interpretation:

- The gateway adds well under a millisecond per governed action in this setup.
- `realpathSync` and `proper-lockfile` dominate; file-based storage is not designed for
  high-throughput multi-process workloads.
- Strict logging awaits the audit write, so real durability cost depends on the disk.
- Numbers are machine-dependent; run `npm run bench` on your target hardware before
  setting latency budgets.

The deterministic fuzz tests in `src/tests/unit/fuzz.test.ts` complement these numbers
by checking that tokenization, path containment and policy evaluation stay total for
random inputs.
