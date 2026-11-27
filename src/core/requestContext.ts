import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  token?: string;
  principalId?: string;
  roles?: string[];
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs work with request-scoped credentials that never enter the domain object. */
export function withRequestContext<T>(context: RequestContext, work: () => T): T {
  return storage.run(context, work);
}

export function requestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requestToken(): string | undefined {
  return storage.getStore()?.token;
}
