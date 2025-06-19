import { createClient, RedisClientType } from 'redis';
import { log } from '../utils/logger';
import { config } from '../config/env';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';

class DragonflyDBManager {
  private client: RedisClientType;
  private connected = false;
  private fallbackMode = false;
  private fallbackStore = new Map<string, any>();

  // === Persistent fallback store (dev-only security) ===
  private readonly fallbackFilePath = path.resolve(process.cwd(), 'fallback-store.json');

  private loadFallbackStoreSync() {
    try {
      if (fs.statSync(this.fallbackFilePath)) {
        const data = fs.readFileSync(this.fallbackFilePath, 'utf-8');
        const obj = JSON.parse(data);
        for (const [k, v] of Object.entries(obj)) {
          this.fallbackStore.set(k, v);
        }
        log.info('Fallback store loaded from disk');
      }
    } catch (err) {
      // File may not exist on first run or statSync may throw – fine for first run.
      log.debug('No existing fallback store file, starting fresh');
    }
  }

  private async persistFallbackStore() {
    try {
      const obj: Record<string, any> = {};
      this.fallbackStore.forEach((v, k) => {
        obj[k] = v;
      });
      await fsPromises.writeFile(this.fallbackFilePath, JSON.stringify(obj), 'utf-8');
      log.debug('Fallback store persisted to disk');
    } catch (err) {
      log.error('Failed to persist fallback store', err);
    }
  }

  constructor() {
    // Prefer DRAGONFLY_URL (e.g., "redis://dragonfly.internal:6379") if provided – useful for private networking on Railway
    this.client = process.env.DRAGONFLY_URL
      ? createClient({ url: process.env.DRAGONFLY_URL, pingInterval: 1000 })
      : createClient({
          socket: { host: config.REDIS_HOST, port: config.REDIS_PORT },
          pingInterval: 1000,
        });
    
    this.client.on('error', (err) => {
      if (!this.fallbackMode) {
        log.warn('DragonflyDB not available, using fallback mode');
        this.fallbackMode = true;
      }
    });
    this.client.on('connect', () => {
      this.connected = true;
      this.fallbackMode = false;
      log.info('DragonflyDB connected');
    });
    this.client.on('disconnect', () => {
      this.connected = false;
      log.warn('DragonflyDB disconnected');
    });

    // Load any persisted fallback data on startup synchronously so counts are ready.
    this.loadFallbackStoreSync();
  }

  async connect() {
    try {
      if (!this.connected && !this.fallbackMode) {
        // Add timeout to prevent hanging
        const connectPromise = this.client.connect();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 3000)
        );
        
        await Promise.race([connectPromise, timeoutPromise]);
        log.info('DragonflyDB connection established');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('DragonflyDB unavailable, using fallback mode:', message);
      this.fallbackMode = true;
      this.connected = false;
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.disconnect();
      log.info('DragonflyDB disconnected');
    }
  }

  // Initialize a new chat with sensible defaults including a placeholder title.
  // Title can be updated later (e.g., after the first user message) via updateChatState.
  async initChat(userId: string, chatId: string, model = 'gpt-4', title: string = 'New Chat') {
    const data = {
      userId,
      model,
      context: '[]',
      streaming: 'false',
      created: Date.now().toString(),
      title,
    } as Record<string, string>;
    
    if (this.fallbackMode) {
      this.fallbackStore.set(`chat:${chatId}`, data);
      this.fallbackStore.set(`user:${userId}:chats`, 
        [...(this.fallbackStore.get(`user:${userId}:chats`) || []), chatId]);
    } else {
      await this.client.hSet(`chat:${chatId}`, data);
      await this.client.sAdd(`user:${userId}:chats`, chatId);
    }
    log.debug('Chat initialized', { userId, chatId, model, fallback: this.fallbackMode });
  }

  async getChatState(chatId: string) {
    if (this.fallbackMode) {
      return this.fallbackStore.get(`chat:${chatId}`) || {};
    }
    return await this.client.hGetAll(`chat:${chatId}`);
  }

  async updateChatState(chatId: string, updates: Record<string, string>) {
    if (this.fallbackMode) {
      const current = this.fallbackStore.get(`chat:${chatId}`) || {};
      this.fallbackStore.set(`chat:${chatId}`, { ...current, ...updates });
    } else {
      await this.client.hSet(`chat:${chatId}`, updates);
    }
  }

  async getUserChats(userId: string) {
    if (this.fallbackMode) {
      return this.fallbackStore.get(`user:${userId}:chats`) || [];
    }
    return await this.client.sMembers(`user:${userId}:chats`);
  }

  // Real-time streaming with fallback
  async startStreaming(chatId: string) {
    if (this.fallbackMode) {
      this.fallbackStore.set(`chat:${chatId}:stream`, '');
      await this.updateChatState(chatId, { streaming: 'true' });
    } else {
      await this.client.hSet(`chat:${chatId}`, 'streaming', 'true');
      await this.client.del(`chat:${chatId}:stream`);
    }
  }

  async appendStream(chatId: string, token: string) {
    if (this.fallbackMode) {
      const current = this.fallbackStore.get(`chat:${chatId}:stream`) || '';
      this.fallbackStore.set(`chat:${chatId}:stream`, current + token);
      // In fallback mode, we can't publish/subscribe, so just log
      log.debug('Stream token (fallback)', { chatId, token });
    } else {
      await this.client.append(`chat:${chatId}:stream`, token);
      await this.client.publish(`chat:${chatId}:tokens`, token);
    }
  }

  async finishStreaming(chatId: string) {
    if (this.fallbackMode) {
      const fullResponse = this.fallbackStore.get(`chat:${chatId}:stream`) || '';
      await this.updateChatState(chatId, { streaming: 'false' });
      return fullResponse;
    } else {
      const fullResponse = await this.client.get(`chat:${chatId}:stream`);
      await this.client.hSet(`chat:${chatId}`, 'streaming', 'false');
      return fullResponse;
    }
  }

  // User API key storage for BYOK
  async setUserKey(userId: string, provider: string, apiKey: string) {
    const key = `user:${userId}:keys:${provider}`;
    if (this.fallbackMode) {
      this.fallbackStore.set(key, apiKey);
    } else {
      await this.client.set(key, apiKey);
    }
    log.debug('User API key stored', { userId, provider, fallback: this.fallbackMode });
  }

  async getUserKey(userId: string, provider: string): Promise<string | null> {
    const key = `user:${userId}:keys:${provider}`;
    if (this.fallbackMode) {
      return this.fallbackStore.get(key) || null;
    }
    return await this.client.get(key);
  }

  async deleteUserKey(userId: string, provider: string) {
    const key = `user:${userId}:keys:${provider}`;
    if (this.fallbackMode) {
        this.fallbackStore.delete(key);
    } else {
        await this.client.del(key);
    }
    log.debug('User API key deleted', { userId, provider, fallback: this.fallbackMode });
  }

  async get(key: string): Promise<string | null> {
    if (this.fallbackMode) {
      return this.fallbackStore.get(key) || null;
    }
    return await this.client.get(key);
  }

  // Message limit tracking for default models (trial period)
  async getUserMessageCount(userId: string): Promise<number> {
    const key = `user:${userId}:message_count`;
    if (this.fallbackMode) {
      return parseInt(this.fallbackStore.get(key) || '0');
    }
    const count = await this.client.get(key);
    return parseInt(count || '0');
  }

  async incrementUserMessageCount(userId: string): Promise<number> {
    const key = `user:${userId}:message_count`;
    if (this.fallbackMode) {
      const current = parseInt(this.fallbackStore.get(key) || '0');
      const newCount = current + 1;
      this.fallbackStore.set(key, newCount.toString());
      await this.persistFallbackStore();
      return newCount;
    } else {
      return await this.client.incr(key);
    }
  }

  // User theme preferences
  async getUserTheme(userId: string): Promise<{color: string, gradientType: string, containerOpacity?: number, fontSize?: number, chatFontSize?: number} | null> {
    const key = `user:${userId}:theme`;
    if (this.fallbackMode) {
      const theme = this.fallbackStore.get(key);
      return theme ? JSON.parse(theme) : null;
    }
    const theme = await this.client.get(key);
    return theme ? JSON.parse(theme) : null;
  }

  async setUserTheme(userId: string, color: string, gradientType: string, containerOpacity?: number, fontSize?: number, chatFontSize?: number): Promise<void> {
    const key = `user:${userId}:theme`;
    const themeData = JSON.stringify({ color, gradientType, containerOpacity, fontSize, chatFontSize });
    if (this.fallbackMode) {
      this.fallbackStore.set(key, themeData);
    } else {
      await this.client.set(key, themeData);
    }
    log.debug('User theme saved', { userId, color, gradientType, containerOpacity, fontSize, chatFontSize, fallback: this.fallbackMode });
  }

  // Permanently delete a chat and remove it from the user's chat set
  async deleteChat(userId: string, chatId: string) {
    if (this.fallbackMode) {
      // Remove the chat hash
      this.fallbackStore.delete(`chat:${chatId}`);
      // Remove chatId from the user's chat list
      const current = (this.fallbackStore.get(`user:${userId}:chats`) || []) as string[];
      this.fallbackStore.set(
        `user:${userId}:chats`,
        current.filter((id) => id !== chatId)
      );
    } else {
      await this.client.del(`chat:${chatId}`);
      await this.client.sRem(`user:${userId}:chats`, chatId);
    }
    log.debug('Chat deleted', { userId, chatId, fallback: this.fallbackMode });
  }

  // Fetch the current in-progress stream buffer for a chat
  async getStream(chatId: string): Promise<string> {
    if (this.fallbackMode) {
      return this.fallbackStore.get(`chat:${chatId}:stream`) || '';
    } else {
      return (await this.client.get(`chat:${chatId}:stream`)) || '';
    }
  }

  // === Voice trial counter ===
  // Stores how many voice interactions a user has made with the **shared ElevenLabs key**.
  // A separate counter avoids interfering with the textual message limit.
  async getUserVoiceCount(userId: string): Promise<number> {
    const key = `user:${userId}:voice-count`;
    if (this.fallbackMode) {
      return this.fallbackStore.get(key) ?? 0;
    }
    const countStr = await this.client.get(key);
    return countStr ? parseInt(countStr, 10) : 0;
  }

  async incrementUserVoiceCount(userId: string): Promise<number> {
    const key = `user:${userId}:voice-count`;
    let newCount: number;
    if (this.fallbackMode) {
      const current = (this.fallbackStore.get(key) ?? 0) as number;
      newCount = current + 1;
      this.fallbackStore.set(key, newCount);
      // Persist so that refresh doesn't reset usage
      await this.persistFallbackStore();
    } else {
      newCount = await this.client.incr(key);
    }
    return newCount;
  }

  async getUserDefaultModel(userId: string): Promise<string | null> {
    const key = `user:${userId}:default-model`;
    if (this.fallbackMode) {
      return this.fallbackStore.get(key) || null;
    }
    return await this.client.get(key);
  }

  async setUserDefaultModel(userId: string, model: string): Promise<void> {
    const key = `user:${userId}:default-model`;
    if (this.fallbackMode) {
      this.fallbackStore.set(key, model);
    } else {
      await this.client.set(key, model);
    }
    log.debug('User default model saved', { userId, model, fallback: this.fallbackMode });
  }

  get isConnected() { return this.connected || this.fallbackMode; }
  get isFallback() { return this.fallbackMode; }
  get raw() { return this.client; }
}

export const dragonflydb = new DragonflyDBManager(); 