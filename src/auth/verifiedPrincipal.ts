import { createHmac, timingSafeEqual, verify as verifySignature } from 'crypto';
import { PrincipalProvider } from '../gateway/ExecutionGateway';
import { requestToken } from '../core/requestContext';

export interface JwtVerifierOptions {
  secret?: string | Buffer;
  publicKey?: string | Buffer;
  issuer?: string;
  audience?: string;
  idClaim?: string;
  roleClaim?: string;
  clockToleranceSeconds?: number;
}

function decodePart(part: string): Record<string, any> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf-8'));
}

/** Creates a principal provider that verifies JWT bearer tokens locally. */
export function verifiedPrincipalProvider(options: JwtVerifierOptions): PrincipalProvider {
  if (!options.secret && !options.publicKey) {
    throw new Error('JwtVerifier requires a secret or public key');
  }
  const idClaim = options.idClaim ?? 'sub';
  const roleClaim = options.roleClaim ?? 'roles';
  const tolerance = options.clockToleranceSeconds ?? 30;

  return async (_action) => {
    const token = requestToken();
    if (!token) throw new Error('Missing principal token');

    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid principal token');
    const [headerPart, payloadPart, signaturePart] = parts;

    let header: Record<string, any>;
    let payload: Record<string, any>;
    try {
      header = decodePart(headerPart);
      payload = decodePart(payloadPart);
    } catch {
      throw new Error('Invalid principal token');
    }

    const data = `${headerPart}.${payloadPart}`;
    const signature = Buffer.from(signaturePart, 'base64url');
    let valid = false;
    if (options.secret && header.alg === 'HS256') {
      const expected = createHmac('sha256', options.secret).update(data).digest();
      valid = expected.length === signature.length && timingSafeEqual(expected, signature);
    } else if (options.publicKey && header.alg === 'RS256') {
      valid = verifySignature('RSA-SHA256', Buffer.from(data), options.publicKey, signature);
    }
    if (!valid) throw new Error('Invalid principal token signature');

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp !== undefined && now > payload.exp + tolerance)
      throw new Error('Token expired');
    if (payload.nbf !== undefined && now < payload.nbf - tolerance)
      throw new Error('Token not valid yet');
    if (options.issuer && payload.iss !== options.issuer) throw new Error('Token issuer mismatch');
    if (options.audience) {
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(options.audience)) throw new Error('Token audience mismatch');
    }

    const id = payload[idClaim];
    if (typeof id !== 'string' || id.length === 0) throw new Error('Token missing principal id');
    const roles = Array.isArray(payload[roleClaim])
      ? payload[roleClaim].filter((role: unknown) => typeof role === 'string')
      : [];

    return { id, roles };
  };
}

/** Test/helper: sign a HS256 JWT locally without third-party dependencies. */
export function signHs256Token(
  claims: Record<string, any>,
  secret: string | Buffer,
  header: Record<string, any> = { alg: 'HS256', typ: 'JWT' },
): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
