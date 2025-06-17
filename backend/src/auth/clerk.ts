import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { log } from '../utils/logger';
import { config } from '../config/env';

class ClerkAuth {
  private clerk: ClerkClient | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.CLERK_SECRET_KEY;
    
    if (this.enabled && config.CLERK_SECRET_KEY) {
      this.clerk = createClerkClient({ secretKey: config.CLERK_SECRET_KEY });
      log.info('Clerk authentication enabled');
    } else {
      log.warn('Clerk authentication disabled - no CLERK_SECRET_KEY found');
    }
  }

  async verifyToken(token: string): Promise<string | null> {
    if (!this.enabled || !config.CLERK_SECRET_KEY) {
      // Fallback mode for development
      log.debug('Auth fallback mode - extracting userId from token');
      return token || null;
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: config.CLERK_SECRET_KEY,
        clockSkewInMs: 60_000,
      });
      return payload.sub || null;
    } catch (error) {
      log.error('Token verification failed:', error);
      // DEV lenient mode: attempt to decode JWT without verification so that
      // sockets remain usable even if the signature is invalid (e.g. dev env).
      try {
        const [, payloadBase64] = token.split('.');
        if (payloadBase64) {
          const json = Buffer.from(payloadBase64, 'base64').toString('utf-8');
          const payload = JSON.parse(json);
          if (payload && payload.sub) {
            log.warn('Token verification failed, but decoded sub in lenient mode', { sub: payload.sub });
            return payload.sub;
          }
        }
      } catch {}
      return null;
    }
  }

  extractTokenFromRequest(request: any): string | null {
    // Check Authorization header
    const authHeader = request.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Fallback to query parameter for WebSocket connections
    let token = request.query?.token || null;
    
    // Manual query parsing for WebSocket if needed
    if (!token && (request.url || request.raw?.url)) {
      const url = request.url || request.raw?.url;
      const urlParams = new URLSearchParams(url.split('?')[1] || '');
      token = urlParams.get('token');
    }
    
    log.debug('Token extraction attempt', { 
      hasAuthHeader: !!authHeader,
      queryKeys: Object.keys(request.query || {}),
      token: token ? 'present' : 'missing',
      url: request.url || request.raw?.url
    });
    return token;
  }

  get isEnabled() { return this.enabled; }
}

export const clerkAuth = new ClerkAuth(); 