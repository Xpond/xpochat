import 'dotenv/config';
import express, { Request, Response, NextFunction, Router } from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import { config } from './config/env';
import { dragonflydb } from './db/dragonflydb';
import { wsHandler } from './websocket/handler';
import { authMiddleware } from './middleware/auth';
import { log } from './utils/logger';
import { clerkAuth } from './auth/clerk';
import { URLSearchParams } from 'url';
import { DEFAULT_MODELS, BYOK_PROVIDERS } from './config/ai-providers';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { extractTextFromFile } from './services/document-processor';

// === Neon Postgres & Cloudinary integration ===
import { initNeon, sql } from './db/neon';
// @ts-ignore – no type declarations for cloudinary
import { cloudinary } from './storage/cloudinary';
import { randomUUID } from 'crypto';

// === Trial system ===
const TRIAL_MESSAGE_LIMIT = 50;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Health check (public)
app.get('/health', async (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        dragonflydb: dragonflydb.isConnected,
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
        clerkEnabled: !!config.CLERK_SECRET_KEY
    });
});

// Protected API routes
const apiRouter: Router = express.Router();
apiRouter.use(authMiddleware);

// Get user's chats (id + title)
apiRouter.get('/chats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const chatIds = await dragonflydb.getUserChats(userId);
    const chats = await Promise.all(
      chatIds.map(async (id: string) => {
        const state = await dragonflydb.getChatState(id);
        return {
          id,
          title: state.title || 'New Chat',
          created: parseInt(state.created || '0') || 0
        };
      })
    );
    // Sort by created desc so newest chats first
    chats.sort((a, b) => b.created - a.created);
    res.json({ chats });
  } catch (err) {
    console.error('Failed to list chats', err);
    res.status(500).json({ error: 'Failed to list chats' });
  }
});

// Get specific chat state
apiRouter.get('/chats/:chatId', async (req: Request, res: Response) => {
    const { chatId } = req.params;
    const userId = (req as any).userId;

    const chatState = await dragonflydb.getChatState(chatId);

    if (!chatState || !chatState.userId) {
        return res.status(404).json({ error: 'Chat not found.' });
    }

    if (chatState.userId !== userId) {
        return res.status(403).json({ error: 'You are not authorized to view this chat.' });
    }

    res.json({ chat: chatState });
});

// Rename chat
apiRouter.put('/chats/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;
    const userId = (req as any).userId;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Valid title required' });
    }

    const state = await dragonflydb.getChatState(chatId);
    if (!state.userId) return res.status(404).json({ error: 'Chat not found' });
    if (state.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    await dragonflydb.updateChatState(chatId, { title: title.trim() });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to rename chat', err);
    res.status(500).json({ error: 'Failed to rename chat' });
  }
});

// Delete chat
apiRouter.delete('/chats/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const userId = (req as any).userId;

    const state = await dragonflydb.getChatState(chatId);
    if (!state.userId) return res.status(404).json({ error: 'Chat not found' });
    if (state.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    await dragonflydb.deleteChat(userId, chatId);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete chat', err);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// Share chat - make it publicly accessible
apiRouter.post('/chats/:chatId/share', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { messages } = req.body; // Get current messages from frontend
    const userId = (req as any).userId;

    const state = await dragonflydb.getChatState(chatId);
    if (!state.userId) return res.status(404).json({ error: 'Chat not found' });
    if (state.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    // Mark chat as shared and store current messages
    const updates: Record<string, string> = { 
      shared: 'true',
      sharedAt: Date.now().toString()
    };
    
    // If messages are provided, store them
    if (messages && Array.isArray(messages)) {
      updates.messages = JSON.stringify(messages);
    }
    
    await dragonflydb.updateChatState(chatId, updates);
    
    res.json({ 
      success: true, 
      shareUrl: `/share/${chatId}` 
    });
  } catch (err) {
    console.error('Failed to share chat', err);
    res.status(500).json({ error: 'Failed to share chat' });
  }
});

// Branch chat - create a new chat from a specific message point
apiRouter.post('/chats/branch', async (req: Request, res: Response) => {
  try {
    const { newChatId, originalChatId, messages, branchPoint, model } = req.body;
    const userId = (req as any).userId;

    if (!newChatId || !originalChatId || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid branch parameters' });
    }

    // Verify user owns the original chat
    const originalState = await dragonflydb.getChatState(originalChatId);
    if (!originalState.userId || originalState.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to branch this chat' });
    }

    // Create the new branched chat
    const branchTitle = `Branch from ${originalState.title || 'Chat'}`;
    await dragonflydb.initChat(userId, newChatId, model, branchTitle);
    
    // Store the branched messages in the messages field (not context)
    const messageHistory = JSON.stringify(messages);
    await dragonflydb.updateChatState(newChatId, { 
      messages: messageHistory,
      branchedFrom: originalChatId,
      branchPoint: branchPoint.toString()
    });
    
    res.json({ 
      success: true, 
      chatId: newChatId,
      title: branchTitle 
    });
  } catch (err) {
    console.error('Failed to branch chat', err);
    res.status(500).json({ error: 'Failed to branch chat' });
  }
});

// Create a new empty chat
apiRouter.post('/chats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { chatId, model } = req.body;

    if (!chatId || typeof chatId !== 'string') {
      return res.status(400).json({ error: 'chatId is required' });
    }

    // Prevent overwriting existing chat
    const existing = await dragonflydb.getChatState(chatId);
    if (existing && existing.userId) {
      return res.status(400).json({ error: 'Chat already exists' });
    }

    await dragonflydb.initChat(userId, chatId, model);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Failed to create chat', err);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// === File Upload Configuration ===
// Ensure uploads directory exists at project root (process.cwd())
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage – use timestamp + random suffix filenames to avoid collisions
const storage = multer.diskStorage({
  destination: (_req: Request, _file: any, cb: any) => cb(null, uploadsDir),
  filename: (_req: Request, file: any, cb: any) => {
    const ext = path.extname(file.originalname as string);
    const safeExt = ext.substring(0, 8);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit – adjust as needed
});

// Serve uploaded files as static assets
app.use('/uploads', express.static(uploadsDir));

// === Attachment upload === (under `/api` with auth)
apiRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file: Express.Multer.File | undefined = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Decide Cloudinary resource_type based on MIME for reliable public access
    const mime = file.mimetype;
    const isDoc = mime === 'application/pdf' ||
                 mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                 mime === 'application/msword';

    const result = await cloudinary.uploader.upload(file.path, { 
      resource_type: isDoc ? 'raw' : 'auto',
      access_mode: 'public', // Ensure public access for all file types
      type: 'upload'
    });

    // === Extract text for documents ===
    let extractedText: string | null = null;
    if (isDoc) {
      try {
        const docRes = await extractTextFromFile(file.path, mime);
        if (docRes.text) extractedText = docRes.text;
      } catch (err) {
        console.error('Failed to extract text during upload', err);
      }
    }

    // Remove temporary local file to keep disk clean
    fs.unlink(file.path, () => {});

    const userId = (req as any).userId;
    const { chatId = null, messageId = null } = req.body || {};

    // Persist metadata in Neon – attachments table ensured by initNeon()
    const attachmentId = randomUUID();
    await sql`INSERT INTO attachments (id, user_id, chat_id, message_id, type, storage_key, url, size_bytes, extracted_text)
              VALUES (${attachmentId}, ${userId}, ${chatId}, ${messageId}, ${result.resource_type}, ${result.public_id}, ${result.secure_url}, ${result.bytes}, ${extractedText})`;

    res.json({ url: result.secure_url, publicId: result.public_id, bytes: result.bytes, attachmentId, extractedText });
  } catch (err) {
    console.error('Attachment upload failed', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/models', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;

    // Clone the provider object so we don't mutate the import
    const byokProviders: any = JSON.parse(JSON.stringify(BYOK_PROVIDERS));

    // Currently only OpenRouter supports an easy model listing endpoint – add more as needed
    const openRouterKey = await dragonflydb.getUserKey(userId, 'openrouter');
    if (openRouterKey) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${openRouterKey}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          // The API returns an array. Map to id + name minimal structure.
          const mapped = (Array.isArray(data) ? data : data.data || []).map((m: any) => {
            const rawId = m.id || m.identifier || '';
            return {
              // Prefix with openrouter/ so the backend can later detect that the user explicitly
              // chose the OpenRouter route even if the underlying model id starts with google/, etc.
              id: `openrouter/${rawId}`,
              name: m.name || rawId,
            };
          }).filter((m: any) => m.id && m.name);
          if (mapped.length) {
            byokProviders.openrouter.models = mapped;
          }
        }
      } catch (err) {
        console.error('Failed to fetch OpenRouter models', err);
      }
    }

    const openAiKey = await dragonflydb.getUserKey(userId, 'openai');
    if (openAiKey) {
      try {
        const resp = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${openAiKey}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const candidates = Array.isArray(data)
            ? data
            : (Array.isArray(data.data) ? data.data : []);
          const mapped = candidates
            .filter((m: any) => typeof m.id === 'string' && m.id.includes('gpt'))
            .map((m: any) => {
              const id = m.id.startsWith('openai/') ? m.id : `openai/${m.id}`;
              // Simple prettify: "gpt-4o" -> "GPT-4o" etc.
              const pretty = m.id
                .replace(/^gpt/i, 'GPT')
                .replace(/-/g, ' ')
                .replace(/\b(\d)\b/g, '$1');
              return { id, name: pretty };
            });
          if (mapped.length) {
            byokProviders.openai.models = mapped;
          }
        }
      } catch (err) {
        console.error('Failed to fetch OpenAI models', err);
      }
    }

    // === Google model list ===
    const googleKey = await dragonflydb.getUserKey(userId, 'google');
    if (googleKey) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`);
        if (resp.ok) {
          const data = await resp.json();
          const modelsArr = (data.models || []).map((m: any) => {
            const rawId: string = (m.name || '').replace(/^models\//, '');
            const id = `google/${rawId}`;
            const pretty = rawId
              .replace(/-/g, ' ')
              .replace(/\b(\d+)/g, '$1')
              .replace(/\bpro\b/i, 'Pro')
              .replace(/\bflash\b/i, 'Flash')
              .replace(/\bgemini\b/i, 'Gemini')
              .trim();
            return { id, name: pretty };
          });
          if (modelsArr.length) {
            byokProviders.google.models = modelsArr;
          }
        }
      } catch (err) {
        console.error('Failed to fetch Google models', err);
      }
    }

    res.status(200).send({
      defaultModels: DEFAULT_MODELS,
      byokProviders,
    });
  } catch (err) {
    console.error('Error building model list', err);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

app.get('/api/user/keys', authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  const providers = Object.keys(BYOK_PROVIDERS);
  const activeKeys: string[] = [];

  for (const provider of providers) {
    const key = await dragonflydb.getUserKey(userId, provider);
    if (key) {
      activeKeys.push(provider);
    }
  }
  
  res.status(200).send({ activeKeys });
});

// Get all of a user's BYOK API keys
app.get('/api/user/keys/all', authMiddleware, async (req, res) => {
  try {
      const userId = (req as any).userId;
      const providers = Object.keys(BYOK_PROVIDERS);
      const keys: { [provider: string]: string } = {};

      for (const provider of providers) {
          const key = await dragonflydb.getUserKey(userId, provider);
          if (key) {
              keys[provider] = key;
          }
      }
      res.json({ keys });
  } catch (error) {
      console.error('Error fetching user keys:', error);
      res.status(500).json({ error: 'Failed to fetch keys' });
  }
});

// Delete a user's BYOK API key
app.delete('/api/user/keys/:provider', authMiddleware, async (req, res) => {
  try {
      const userId = (req as any).userId;
      const { provider } = req.params;

      if (!provider || !Object.keys(BYOK_PROVIDERS).includes(provider)) {
          return res.status(400).json({ error: 'Valid provider is required' });
      }

      await dragonflydb.deleteUserKey(userId, provider);

      res.json({ success: true });
  } catch (err) {
      console.error('Error deleting user key', err);
      res.status(500).json({ error: 'Failed to delete key' });
  }
});

// Save or update a user's BYOK API key
app.post('/api/user/keys', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { provider, apiKey } = req.body;

    if (!provider || apiKey === undefined) {
      return res.status(400).json({ error: 'provider and apiKey are required' });
    }

    // Only allow known providers
    if (!Object.keys(BYOK_PROVIDERS).includes(provider)) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    await dragonflydb.setUserKey(userId, provider, apiKey);

    // Return updated active keys list
    const providers = Object.keys(BYOK_PROVIDERS);
    const activeKeys: string[] = [];
    for (const p of providers) {
      const key = await dragonflydb.getUserKey(userId, p);
      if (key) activeKeys.push(p);
    }

    res.json({ success: true, activeKeys });
  } catch (err) {
    console.error('Error saving user key', err);
    res.status(500).json({ error: 'Failed to save key' });
  }
});

// Message count endpoint for trial limit
app.get('/api/user/message-count', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const messageCount = await dragonflydb.getUserMessageCount(userId);
    res.json({ messageCount, limit: TRIAL_MESSAGE_LIMIT });
  } catch (error) {
    console.error('Error fetching user message count:', error);
    res.status(500).json({ error: 'Failed to fetch message count' });
  }
});

// Theme preferences endpoints
app.get('/api/user/theme', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const theme = await dragonflydb.getUserTheme(userId);
    res.json({ theme: theme || { color: '#1a4a4a', gradientType: 'linear-diagonal', containerOpacity: 80, fontSize: 90, chatFontSize: 100 } });
  } catch (error) {
    console.error('Error fetching user theme:', error);
    res.status(500).json({ error: 'Failed to fetch theme' });
  }
});

app.post('/api/user/theme', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { color, gradientType, containerOpacity, fontSize, chatFontSize } = req.body;
    
    if (!color || !gradientType) {
      return res.status(400).json({ error: 'Color and gradientType are required' });
    }
    
    await dragonflydb.setUserTheme(userId, color, gradientType, containerOpacity, fontSize, chatFontSize);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving user theme:', error);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// === Default model preference endpoints ===
app.get('/api/user/default-model', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const saved = await dragonflydb.getUserDefaultModel(userId);
    res.json({ model: saved || DEFAULT_MODELS[0].id });
  } catch (error) {
    console.error('Error fetching user default model:', error);
    res.status(500).json({ error: 'Failed to fetch default model' });
  }
});

app.post('/api/user/default-model', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { model } = req.body;

    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'model is required' });
    }

    await dragonflydb.setUserDefaultModel(userId, model);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving user default model:', error);
    res.status(500).json({ error: 'Failed to save default model' });
  }
});

// Public endpoint for shared chats (MUST be before /api router)
app.get('/api/share/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    
    const chatState = await dragonflydb.getChatState(chatId);
    
    if (!chatState || !chatState.userId || chatState.shared !== 'true') {
      return res.status(404).json({ error: 'Shared chat not found' });
    }

    // Return chat data for public viewing - use messages field, fallback to context
    const messages = chatState.messages || chatState.context || '[]';
    
    res.json({ 
      chat: {
        id: chatId,
        title: chatState.title || 'Shared Chat',
        context: messages,
        model: chatState.model,
        created: parseInt(chatState.created || '0'),
        sharedAt: parseInt(chatState.sharedAt || '0')
      }
    });
  } catch (err) {
    console.error('Failed to get shared chat', err);
    res.status(500).json({ error: 'Failed to get shared chat' });
  }
});

app.use('/api', apiRouter);

// WebSocket connection handling
wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    try {
        const url = new URL(req.url!, `ws://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
            log.warn('[/ws] handler: Authentication failed - no token provided.');
            ws.close(1008, 'Unauthorized');
            return;
        }

        const userId = await clerkAuth.verifyToken(token);
        if (!userId) {
            log.warn('[/ws] handler: Authentication failed - invalid token.');
            ws.close(1008, 'Unauthorized');
            return;
        }

        log.info(`[/ws] handler: Authentication successful for userId: ${userId}`);
        
        // Attach userId to the request for wsHandler
        (req as any).userId = userId;

        // Pass the raw WebSocket and request to the handler
        wsHandler.handleConnection(ws, req);

    } catch (err) {
        log.error('[/ws] handler: Unexpected error during authentication.', err);
        ws.close(1011, 'Internal Server Error');
    }
});

// Graceful shutdown
const gracefulShutdown = async () => {
  log.info('Shutting down gracefully...');
  await dragonflydb.disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
const start = async () => {
  try {
    log.info('Xpochat backend starting...', {
      port: config.PORT,
      host: config.HOST,
      environment: config.NODE_ENV
    });
    
    // Connect to DragonflyDB & ensure Neon schema
    await dragonflydb.connect();
    await initNeon();
    
    // Start server
    server.listen(config.PORT, config.HOST, () => {
        log.info(`Server running on http://${config.HOST}:${config.PORT}`);
        log.info(`WebSocket available at ws://${config.HOST}:${config.PORT}`);
    });
    
  } catch (error) {
    log.error('Failed to start server:', error);
    process.exit(1);
  }
};

start(); 