import { Request, Response, NextFunction } from 'express';
import { clerkAuth } from '../auth/clerk';
import { log } from '../utils/logger';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = clerkAuth.extractTokenFromRequest(req);
  
  if (!token) {
    log.warn('Unauthorized request - no token', { url: req.originalUrl });
    return res.status(401).send({ error: 'Unauthorized' });
  }

  const userId = await clerkAuth.verifyToken(token);
  
  if (!userId) {
    log.warn('Unauthorized request - invalid token', { url: req.originalUrl });
    return res.status(401).send({ error: 'Unauthorized' });
  }

  // Add userId to request context
  (req as any).userId = userId;
  log.debug('Request authenticated', { userId, url: req.originalUrl });
  next();
} 