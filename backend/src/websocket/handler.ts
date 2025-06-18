import { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { dragonflydb } from '../db/dragonflydb';
import { log } from '../utils/logger';
import { routeChat } from '../services/ai-router';
import { RedisClientType } from 'redis';

interface ChatMessage {
  type: 'chat' | 'typing' | 'join' | 'leave';
  chatId: string;
  userId: string;
  content?: string;
  model?: string;
  messages?: { role: string; content: string }[];
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url?: string;
    base64?: string;
  }>;
}

class WebSocketHandler {
  private connections = new Map<string, WebSocket>();
  private subscriptions = new Map<string, { client: RedisClientType, chatId: string }>();

  async handleConnection(socket: WebSocket, request: IncomingMessage) {
    const userId = (request as any).userId as string | undefined;

    if (!userId) {
      log.error('WebSocket connection failed: No userId found after authentication.');
      socket.close(1011, 'Internal Server Error');
      return;
    }

    const connectionId = `${userId}-${Date.now()}`;
    this.connections.set(connectionId, socket);
    
    log.info('WebSocket connected', { userId, connectionId });

    socket.on('message', async (data: WebSocket.Data) => {
      try {
        const message: ChatMessage = JSON.parse(data.toString());
        await this.handleMessage(connectionId, userId, message);
      } catch (error) {
        log.error('WebSocket message error:', error);
        this.sendError(socket, 'Invalid message format');
      }
    });

    socket.on('close', async () => {
      this.connections.delete(connectionId);

      // Clean up any active Redis subscription for this connection.
      const sub = this.subscriptions.get(connectionId);
      if (sub) {
        try {
          await sub.client.unsubscribe(`chat:${sub.chatId}:tokens`);
          await sub.client.quit();
        } catch (err) {
          log.warn('Failed to clean up Redis subscription on socket close', { err });
        }
        this.subscriptions.delete(connectionId);
      }

      log.info('WebSocket disconnected', { userId: userId, connectionId });
    });
  }

  private async handleMessage(connectionId: string, userId: string, message: ChatMessage) {
    const { type, chatId, content } = message;

    switch (type) {
      case 'join':
        await this.joinChat(connectionId, userId, chatId);
        break;
      case 'chat':
        if (content || message.messages) await this.processChat(connectionId, userId, chatId, message);
        break;
      case 'typing':
        await this.broadcastTyping(userId, chatId);
        break;
    }
  }

  private async joinChat(connectionId: string, userId: string, chatId: string) {
    if (!dragonflydb.isFallback) {
      // If we already have a subscription for this connection, unsubscribe first
      const existingSub = this.subscriptions.get(connectionId);
      if (existingSub) {
        try {
          await existingSub.client.unsubscribe(`chat:${existingSub.chatId}:tokens`);
          await existingSub.client.quit();
          log.debug('Cleaned up previous Redis subscription', { 
            connectionId, 
            previousChatId: existingSub.chatId, 
            newChatId: chatId 
          });
        } catch (err) {
          log.warn('Failed to clean up previous Redis subscription', { err });
        }
        this.subscriptions.delete(connectionId);
      }

      try {
        const subscriber = dragonflydb.raw.duplicate();
        await subscriber.connect();
        await subscriber.subscribe(`chat:${chatId}:tokens`, (token) => {
          if (token.startsWith('__REASONING__')) {
            const reasoningContent = token.substring('__REASONING__'.length);
            this.sendToConnection(connectionId, {
              type: 'reasoning',
              chatId,
              content: reasoningContent
            });
          } else if (token.startsWith('__TTS__')) {
            const audioDataUrl = token.substring('__TTS__'.length);
            this.sendToConnection(connectionId, {
              type: 'tts',
              chatId,
              audio: audioDataUrl
            });
          } else {
            this.sendToConnection(connectionId, {
              type: 'token',
              chatId,
              content: token
            });
          }
        });

        // Store the new subscription so we can clean it up later
        this.subscriptions.set(connectionId, { client: subscriber, chatId });

        log.debug('User subscribed to chat updates', { userId, chatId });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error('Failed to subscribe to Redis for chat updates.', { chatId, userId, error: errorMessage });
        this.sendToConnection(connectionId, {
          type: 'error',
          message: 'Real-time updates are currently unavailable for this chat.'
        });
      }
    } else {
      log.warn('DragonflyDB is in fallback mode. Skipping Redis subscription.', { userId, chatId });
    }

    // Only send joined confirmation after subscription is ready (or fallback path complete)
    this.sendToConnection(connectionId, {
      type: 'joined',
      chatId,
      message: `Successfully joined chat ${chatId}.`
    });
     
     // If chat is currently streaming, send current progress so user sees what's been streamed so far
     const chatState = await dragonflydb.getChatState(chatId);
     if (chatState.streaming === 'true') {
       const streamBuffer = await dragonflydb.getStream(chatId);
       if (streamBuffer) {
         log.debug('Sending stream progress for resumed chat', { 
           chatId, 
           bufferLength: streamBuffer.length,
           connectionId 
         });
         this.sendToConnection(connectionId, {
           type: 'stream-progress',
           chatId,
           content: streamBuffer
         });
       }
     }
    
    log.debug('User joined chat', { userId, chatId });
  }

  private async processChat(connectionId: string, userId: string, chatId: string, message: ChatMessage) {
    const chatState = await dragonflydb.getChatState(chatId);
    if (!chatState.userId) {
      await dragonflydb.initChat(userId, chatId, message.model);
      log.info('Initialized new chat', { userId, chatId, model: message.model });
    }

    if (message.content) {
      const latestState = await dragonflydb.getChatState(chatId);
      if (!latestState.title) {
        const candidate = message.content
          .trim()
          .replace(/\s+/g, ' ')
          .split(' ')
          .slice(0, 6)
          .join(' ');
        const title = (candidate.length > 50 ? candidate.slice(0, 47) + '…' : candidate)
          .replace(/^[a-z]/, (s) => s.toUpperCase());
        await dragonflydb.updateChatState(chatId, { title });
        log.debug('Chat title generated', { chatId, title });
      }
    }

    if (message.messages) {
      await dragonflydb.updateChatState(chatId, {
        messages: JSON.stringify(message.messages),
      });
    }
    
    routeChat(userId, chatId, message.attachments);
    
    log.info('Chat processing routed', { userId, chatId });

    if (dragonflydb.isFallback) {
      // In fallback mode there is no pub/sub, so we periodically poll the buffer
      // until the stream is finished and then emit the full response in one go.
      const pollIntervalMs = 200;
      const maxAttempts = 50; // 10 seconds total
      let attempts = 0;

      const timer = setInterval(async () => {
        attempts++;
        const state = await dragonflydb.getChatState(chatId);
        if (state.streaming === 'false') {
          clearInterval(timer);
          const streamBuffer = await dragonflydb.getStream(chatId);
          if (streamBuffer) {
            this.sendToConnection(connectionId, {
              type: 'resume',
              chatId,
              content: streamBuffer,
            });
          }
        } else if (attempts >= maxAttempts) {
          clearInterval(timer);
          log.warn('Polling timeout: assistant response not delivered to client (fallback mode).', { chatId });
        }
      }, pollIntervalMs);
    }
  }

  private async broadcastTyping(userId: string, chatId: string) {
    this.connections.forEach((socket) => {
      this.sendToConnection(socket, {
        type: 'typing',
        chatId,
        userId
      });
    });
  }

  private sendToConnection(connectionIdOrSocket: string | WebSocket, data: any) {
    const socket = typeof connectionIdOrSocket === 'string' 
      ? this.connections.get(connectionIdOrSocket)
      : connectionIdOrSocket;
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
  }

  private sendError(socket: WebSocket, message: string) {
    this.sendToConnection(socket, { type: 'error', message });
  }
}

export const wsHandler = new WebSocketHandler(); 