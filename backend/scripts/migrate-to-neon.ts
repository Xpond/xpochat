import { dragonflydb } from '../src/db/dragonflydb';
import { initNeon, sql } from '../src/db/neon';
import { randomUUID } from 'crypto';
import { log } from '../src/utils/logger';

/**
 * One-shot migration: copy every chat & message from DragonflyDB to Neon.
 * Run manually with:  bun run backend/scripts/migrate-to-neon.ts
 */
const migrate = async () => {
  await dragonflydb.connect();
  await initNeon();

  if (dragonflydb.isFallback) {
    log.error('DragonflyDB is in fallback mode – live Redis not connected. Aborting migration.');
    process.exit(1);
  }

  const client = dragonflydb.raw;
  let cursor = '0';
  const chatIds: string[] = [];

  // Scan all chat:* keys
  do {
    const res = await client.scan(cursor, { MATCH: 'chat:*', COUNT: 100 });
    cursor = res.cursor;
    const keys: string[] = res.keys;
    keys.forEach((k) => {
      const parts = k.split(':');
      if (parts.length === 2) chatIds.push(parts[1]);
    });
  } while (cursor !== '0');

  log.info(`Found ${chatIds.length} chats to migrate`);

  let migratedChats = 0;
  let migratedMessages = 0;

  for (const chatId of chatIds) {
    const chatState = await dragonflydb.getChatState(chatId);
    if (!chatState.userId) continue;

    const createdAtMs = parseInt(chatState.created || Date.now().toString(), 10);
    const chatExists = await sql`SELECT 1 FROM chats WHERE id=${chatId} LIMIT 1`;
    if (chatExists.length === 0) {
      await sql`INSERT INTO chats (id, user_id, created_at, title, model)
                VALUES (${chatId}, ${chatState.userId}, to_timestamp(${createdAtMs} / 1000.0), ${chatState.title || 'Chat'}, ${chatState.model || ''})`;
      migratedChats++;
    }

    if (chatState.messages) {
      try {
        const msgs: Array<{ role: string; content: string; attachments?: any[] }> = JSON.parse(chatState.messages);
        for (const m of msgs) {
          const msgId = randomUUID();
          const role = m.role === 'assistant' ? 1 : 0;
          await sql`INSERT INTO messages (id, chat_id, role, content, attachments)
                    VALUES (${msgId}, ${chatId}, ${role}, ${m.content || ''}, ${JSON.stringify(m.attachments || [])})`;
          migratedMessages++;
        }
      } catch (err) {
        log.error('Failed to parse messages JSON for chat', { chatId, err });
      }
    }
  }

  log.info(`Migration complete. Chats: ${migratedChats}, Messages: ${migratedMessages}`);
  await dragonflydb.disconnect();
  process.exit(0);
};

migrate(); 