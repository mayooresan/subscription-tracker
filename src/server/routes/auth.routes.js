import { Router } from 'express';
import { verifyPassword, createSessionToken, verifySessionToken } from '../auth.js';

export function createAuthRouter(config) {
  const router = Router();

  router.post('/login', (req, res) => {
    const { password } = req.body || {};
    if (!verifyPassword(password, config?.appPassword)) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    const token = createSessionToken(config.sessionSecret);
    res.cookie('sub_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === 'production',
    });

    return res.json({ success: true, message: 'Authenticated successfully' });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('sub_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return res.json({ success: true, message: 'Logged out' });
  });

  router.get('/status', (req, res) => {
    const token = req.cookies?.sub_session;
    const authenticated = Boolean(token && verifySessionToken(token, config?.sessionSecret));
    return res.json({ authenticated });
  });

  return router;
}
