import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BudgetTracker } from '../../gateway/BudgetTracker';
import { FileBudgetStore } from '../../gateway/FileBudgetStore';

describe('FileBudgetStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-budget-store-'));
    file = path.join(dir, 'budgets.json');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('two trackers with separate store instances share one budget', async () => {
    const first = new BudgetTracker({ alice: { maxCalls: 1 } }, new FileBudgetStore(file));
    const second = new BudgetTracker({ alice: { maxCalls: 1 } }, new FileBudgetStore(file));

    expect((await first.consumeExecution('alice')).allowed).toBe(true);
    expect((await second.consumeExecution('alice')).allowed).toBe(false);
  });

  test('concurrent reservations across stores never exceed the cap', async () => {
    const stores = [
      new BudgetTracker({ alice: { maxCalls: 2 } }, new FileBudgetStore(file)),
      new BudgetTracker({ alice: { maxCalls: 2 } }, new FileBudgetStore(file)),
    ];
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => stores[index % 2].consumeExecution('alice')),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
  });

  test('attempts and executions persist across instances', async () => {
    const first = new BudgetTracker({ alice: { maxCalls: 3 } }, new FileBudgetStore(file));
    await first.noteAttempt('alice');
    await first.consumeExecution('alice');

    const shared = new FileBudgetStore(file);
    const second = new BudgetTracker({ alice: { maxCalls: 3 } }, shared);
    const snapshot = await second.snapshotFor('alice');
    expect(snapshot?.attempts).toBe(1);
    expect(snapshot?.executed).toBe(1);
  });

  test('a corrupt store fails closed instead of granting budget', () => {
    fs.writeFileSync(file, '{ not json');
    expect(() => new FileBudgetStore(file)).toThrow(/Corrupt budget store/);
  });

  test('a malformed snapshot fails closed', () => {
    fs.writeFileSync(file, JSON.stringify({ alice: { attempts: -1 } }));
    expect(() => new FileBudgetStore(file)).toThrow(/Corrupt budget store/);
  });
});
