#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import { createAgent } from '../index';
import { AuditLogger } from '../logging/AuditLogger';
import { defaultPolicy } from '../defaults/defaultPolicy';

/**
 * Verification is read-only: never construct a logger against a path that does
 * not exist, and treat flag-like arguments as usage errors rather than files.
 */
export function resolveVerifyTarget(raw: string | undefined): {
  target: string;
  label: string;
  loggerOptions: { segmented: boolean; logDir?: string; logPath?: string };
} {
  if (raw?.startsWith('-')) {
    throw new Error('Usage: permiscope verify [audit.log|audit-directory|manifest.json]');
  }
  const target = path.resolve(raw ?? './logs/audit.log');
  if (!fs.existsSync(target)) throw new Error(`Audit target not found: ${target}`);
  const isDirectory = fs.statSync(target).isDirectory();
  const segmented = isDirectory || path.basename(target) === 'manifest.json';
  if (segmented) {
    const manifest = isDirectory ? path.join(target, 'manifest.json') : target;
    if (!fs.existsSync(manifest)) throw new Error(`Segment manifest not found: ${manifest}`);
  }
  return {
    target,
    label: isDirectory ? path.join(target, 'manifest.json') : target,
    loggerOptions: segmented
      ? { segmented: true, logDir: isDirectory ? target : path.dirname(target) }
      : { segmented: false, logPath: target },
  };
}

async function runDemo() {
  // Import dynamically or just move logic here to avoid circularity if index.ts exports createAgent
  // Actually src/index.ts imports this file? No, it imports Adapter.
  // Let's just move the demo logic here.
  console.clear();
  console.log('🔒 \x1b[36mWelcome to Permiscope\x1b[0m - The Trust Layer for AI Agents\n');
  console.log('We are setting up a secure agent with \x1b[32mZero Configuration\x1b[0m...\n');

  const agent = createAgent();
  console.log('✅ Agent initialized with Default Safe Policy.\n');

  await new Promise((r) => setTimeout(r, 800));

  console.log('► [Action 1] Agent tries SAFE command: \x1b[33m\'echo "Hello World"\'\x1b[0m');
  try {
    const res = await agent.act('run_command', { command: 'echo "Hello World"' });
    console.log(`   Running... \n   \x1b[32m✔ ALLOWED:\x1b[0m Output: "${res.trim()}"`);
  } catch (e: any) {
    console.log(`   ❌ BLOCKED: ${e.message}`);
  }

  console.log('');
  await new Promise((r) => setTimeout(r, 1000));

  console.log("► [Action 2] Agent tries DANGEROUS command: \x1b[33m'rm -rf /'\x1b[0m");
  try {
    await agent.act('run_command', { command: 'rm -rf /' });
  } catch {
    console.log(`   \x1b[31m🛡️  BLOCKED BY POLICY:\x1b[0m Dangerous pattern detected!`);
    console.log(`   (Your system is safe)`);
  }

  console.log("\n✨ \x1b[36mDemo Complete.\x1b[0m That's the power of Permiscope.");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--demo') || args[0] === 'demo') {
    await runDemo();
    process.exit(0);
  }

  if (args[0] === 'serve') {
    const token = process.env.PERMISCOPE_SIDECAR_TOKEN;
    if (!token) {
      console.error('Set PERMISCOPE_SIDECAR_TOKEN before starting the sidecar.');
      process.exit(1);
    }
    const { startSidecar } = await import('../sidecar/server');
    const host = process.env.PERMISCOPE_SIDECAR_HOST ?? '127.0.0.1';
    const port = Number(process.env.PERMISCOPE_SIDECAR_PORT ?? 8787);
    await startSidecar({ policy: defaultPolicy, token, host, port });
    console.log(`Permiscope sidecar listening on http://${host}:${port}`);
    return;
  }

  if (args[0] === 'eval') {
    const { runEval } = await import('../eval/runner');
    const result = await runEval(args[1]);
    console.log(
      `Permiscope eval v${result.version}: ${result.passed}/${result.total} passed (${result.passRate.toFixed(1)}%)`,
    );
    for (const failure of result.failures) {
      console.error(`  ✗ ${failure.id}: expected ${failure.expected}, got ${failure.actual}`);
    }
    process.exit(result.failed === 0 ? 0 : 1);
  }

  if (args[0] === 'audit' && args[1] === 'migrate') {
    const source = path.resolve(args[2] || './logs/audit.log');
    const target = path.resolve(args[3] || './logs/audit');
    try {
      const { migrateLegacyAudit } = await import('../logging/migrateAudit');
      const result = migrateLegacyAudit(source, target);
      console.log(`✅ Migrated ${result.entries} entries to ${result.segmentDir}`);
    } catch (error: any) {
      console.error(`❌ Migration failed: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (args[0] === 'verify') {
    let resolved;
    try {
      resolved = resolveVerifyTarget(args[1]);
    } catch (error: any) {
      console.error(`❌ ${error.message}`);
      process.exit(2);
      return;
    }
    const logger = new AuditLogger(path.dirname(resolved.target), false, resolved.loggerOptions);
    const label = resolved.label;
    const result = logger.verifyChain();
    if (result.valid) {
      console.log(`✅ Audit chain valid: ${label}`);
    } else {
      console.error(`❌ Audit chain invalid: ${label}`);
      for (const error of result.errors.slice(0, 10)) console.error(`  - ${error}`);
      if (result.errors.length > 10) {
        console.error(`  ... and ${result.errors.length - 10} more error(s)`);
      }
    }
    process.exit(result.valid ? 0 : 1);
  }

  if (args.length === 0) {
    console.log('Usage: permiscope <command> [args...]');
    console.log('Example: permiscope run_command "echo hello"');
    console.log('         permiscope read_file "C:/Safe/data.txt"');
    console.log('         permiscope eval [cases.json]');
    console.log('         permiscope verify [audit.log|segment-dir|manifest.json]');
    console.log('         permiscope audit migrate [audit.log] [segment-dir]');
    console.log('         permiscope serve  (needs PERMISCOPE_SIDECAR_TOKEN)');
    console.log('         permiscope --demo');
    process.exit(1);
  }

  const actionName = args[0];
  const paramsRaw = args.slice(1).join(' ');

  let parameters: any = {};
  if (actionName === 'run_command') {
    if (!paramsRaw) {
      console.error('❌ Error: run_command requires a command string.');
      console.log('Example: permiscope run_command "echo hello"');
      process.exit(1);
    }
    parameters = { command: paramsRaw };
  } else if (actionName === 'read_file' || actionName === 'write_file') {
    if (!args[1]) {
      console.error(`❌ Error: ${actionName} requires a file path.`);
      console.log(`Example: permiscope ${actionName} "C:/Safe/data.txt"`);
      process.exit(1);
    }
    parameters = { path: args[1] };
  } else {
    parameters = { args: args.slice(1) };
  }

  console.log(`🔒 Permiscope protecting action: ${actionName}`);
  const agent = createAgent();

  try {
    const result = await agent.act(actionName, parameters);
    console.log('\n--- Output ---');
    console.log(result);
    console.log('--------------');
  } catch (error: any) {
    console.error('\n❌ Action failed:', error.message);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
