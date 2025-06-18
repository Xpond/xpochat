# Xpochat

A lightning-fast, beautifully simple AI chat platform with real-time streaming and multi-provider support.

## Features

- **Ultra-smooth streaming** - Character-by-character AI responses at 60fps
- **Multi-provider AI** - OpenRouter, OpenAI, Anthropic, Google, Groq support
- **BYOK (Bring Your Own Key)** - Unlimited usage with your API keys
- **Real-time chat** - WebSocket-powered instant messaging
- **Beautiful UI** - Animated Three.js background with dynamic theming
- **Multimodal support** - Images and document processing

## Tech Stack

**Frontend**: Next.js, TypeScript, Tailwind CSS, Three.js, Clerk Auth  
**Backend**: Node.js/Bun, Express, WebSocket, DragonflyDB (Redis), Neon Postgres , cloudinary

## Environment Setup

**Backend** (`backend/.env`):
- `PORT` - Server port (default: 3001)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production)
- `CLERK_SECRET_KEY` - Authentication secret key
- `REDIS_HOST/REDIS_PORT` - DragonflyDB/Redis (default: localhost:6379)
- `DATABASE_URL` - Neon Postgres connection string (postgresql://user:pass@endpoint.neon.tech/db)
- `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` - File storage CDN
- `LOG_ENABLED/LOG_LEVEL` - Logging configuration
- `ENABLE_TTS` - Text-to-speech via ElevenLabs (default: false)
- `OPENROUTER_API_KEY` - Default AI provider key

**Frontend** (`frontend/.env`):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk server-side secret
- `NEXT_PUBLIC_STREAMING_SPEED` - Response speed (default: 60)
- `NEXT_PUBLIC_ENABLE_PROD_LOGGING` - Production logging (default: false)

## Quick Start

1. **Start DragonflyDB** (CRITICAL): `docker run -p 6379:6379 docker.dragonflydb.io/dragonflydb/dragonfly`
   - DragonflyDB must be running for real-time chat, WebSocket connections, and session management
   - Without it, the backend will fail to start and all chat functionality will be broken
2. Clone repository and install: `bun install` (both directories)
3. Copy `env.example` to `.env` in both backend/ and frontend/
4. Configure environment variables (Clerk, database, AI providers)
5. Run backend: `cd backend && bun run dev`
6. Run frontend: `cd frontend && bun run dev`
7. Visit `http://localhost:3000`