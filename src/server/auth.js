import crypto from 'node:crypto';

export function verifyPassword(inputPassword, expectedPassword) {
  if (typeof inputPassword !== 'string' || typeof expectedPassword !== 'string') {
    return false;
  }
  const inputHash = crypto.createHash('sha256').update(inputPassword).digest();
  const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

export function createSessionToken(secret) {
  const payload = JSON.stringify({ iat: Date.now() });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(base64Payload).digest('base64url');
  return `${base64Payload}.${signature}`;
}

export function verifySessionToken(token, secret) {
  if (typeof token !== 'string' || typeof secret !== 'string' || !token.includes('.')) {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }
  const [base64Payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(base64Payload).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function createAuthMiddleware(secret) {
  return (req, res, next) => {
    const token = req.cookies?.sub_session;
    if (!token || !verifySessionToken(token, secret)) {
      return res.status(401).json({ error: 'Unauthorized: invalid or missing session' });
    }
    next();
  };
}

export const requireAuth = createAuthMiddleware;
