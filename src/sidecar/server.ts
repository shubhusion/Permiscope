import express, { NextFunction, Request, Response } from 'express';
import { Server } from 'http';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { PolicyEngine } from '../engine/PolicyEngine';
import { ExecutionGateway, GatewayOptions, ActionExecutor } from '../gateway/ExecutionGateway';
import { Action, Policy } from '../core/types';
import { withRequestContext } from '../core/requestContext';
import { IdempotencyCache } from '../gateway/IdempotencyCache';
import { BudgetStore } from '../gateway/BudgetTracker';

const ActionInputSchema = z.object({
  actionName: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().optional(),
});

type ActionInput = z.infer<typeof ActionInputSchema>;

export interface SidecarOptions {
  policy: Policy;
  token: string;
  host?: string;
  port?: number;
  maxBodyBytes?: number;
  principalId?: string;
  customExecutors?: Record<string, ActionExecutor>;
  gatewayOptions?: Partial<GatewayOptions>;
  /** Optional budget backend shared by multiple sidecar processes. */
  budgetStore?: BudgetStore;
  allowRemote?: boolean;
  /** Optional shared replay cache; defaults to a bounded in-process cache. */
  idempotencyCache?: IdempotencyCache;
  maxIdempotencyEntries?: number;
  idempotencyTtlMs?: number;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function authorized(provided: string | undefined, token: string): boolean {
  if (!provided) return false;
  const actual = Buffer.from(provided);
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

function toAction(input: ActionInput, principalId: string): Action {
  return {
    actionName: input.actionName,
    parameters: input.parameters as Record<string, any>,
    agentId: principalId,
    reason: input.reason,
    timestamp: new Date(),
  };
}

export function createSidecar(options: SidecarOptions): {
  app: express.Express;
  gateway: ExecutionGateway;
} {
  if (!options.token) throw new Error('Sidecar requires a bearer token');

  const host = options.host ?? '127.0.0.1';
  if (!options.allowRemote && !LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Refusing to bind non-loopback host '${host}' without allowRemote: true`);
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: options.maxBodyBytes ?? 64 * 1024 }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    if (!authorized(req.headers.authorization, options.token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  const gateway = new ExecutionGateway(
    new PolicyEngine(options.policy),
    options.customExecutors ?? {},
    {
      ...options.gatewayOptions,
      ...(options.budgetStore ? { budgetStore: options.budgetStore } : {}),
      defaultPrincipalId:
        options.principalId ?? options.gatewayOptions?.defaultPrincipalId ?? 'sidecar',
      // A service has no TTY: never wait for an interactive human.
      approver: options.gatewayOptions?.approver ?? (async () => false),
      approvalTimeoutMs: options.gatewayOptions?.approvalTimeoutMs ?? 1000,
    },
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/v1/decide', async (req, res) => {
    const parsed = ActionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }
    const token = bearerToken(req.headers.authorization);
    const decision = await withRequestContext({ token }, () =>
      gateway.decide(toAction(parsed.data, gatewayIdentity(options))),
    );
    res.json({ decision });
  });

  const idempotencyCache =
    options.idempotencyCache ??
    new IdempotencyCache(options.maxIdempotencyEntries, options.idempotencyTtlMs);

  app.post('/v1/execute', async (req, res) => {
    const parsed = ActionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }
    const token = bearerToken(req.headers.authorization);
    const execute = () =>
      withRequestContext({ token }, () =>
        gateway.run(toAction(parsed.data, gatewayIdentity(options))),
      );
    const key = req.header('Idempotency-Key');
    const result = key
      ? await idempotencyCache.getOrCompute(
          token ? createHash('sha256').update(token).digest('hex') : gatewayIdentity(options),
          key,
          execute,
        )
      : await execute();
    res.json(result);
  });

  app.use((error: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.type === 'entity.too.large' ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'Request body too large' : 'Bad request' });
  });

  return { app, gateway };
}

function gatewayIdentity(options: SidecarOptions): string {
  return options.principalId ?? options.gatewayOptions?.defaultPrincipalId ?? 'sidecar';
}

export function startSidecar(options: SidecarOptions): Promise<Server> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const { app } = createSidecar(options);
  return new Promise((resolve, reject) => {
    // Express 5 attaches the listen callback to 'error' as well, invoking it
    // with the error as its first argument. Check that before resolving.
    const server = app.listen(port, host, (error?: Error) => {
      if (error) reject(error);
      else resolve(server);
    });
    // Safety net for non-Express servers that emit 'error' without calling back.
    server.on('error', reject);
  });
}
