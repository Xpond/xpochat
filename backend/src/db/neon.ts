// @ts-ignore – types added when dependency installed
import { neon } from '@neondatabase/serverless';
import { config } from '../config/env';

// Single shared sql tag bound to the DATABASE_URL
export const sql = neon(config.DATABASE_URL);

// On serverless driver there is no explicit connect/disconnect, but we can run
// one-time initialisation DDL here.
export const initNeon = async () => {
  // If tables exist from a previous attempt (wrong schema), drop them so we can recreate with correct TEXT primary keys.
  await sql`DROP TABLE IF EXISTS attachments;`;
  await sql`DROP TABLE IF EXISTS messages;`;
  await sql`DROP TABLE IF EXISTS chats;`;

  await sql`CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    title TEXT,
    model TEXT
  );`;

  await sql`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
    role SMALLINT NOT NULL,
    content TEXT,
    attachments JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`;

  // Attachments table
  await sql`CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    chat_id TEXT,
    message_id TEXT,
    type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    url TEXT NOT NULL,
    size_bytes INT,
    extracted_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`;
}; 