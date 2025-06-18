import { log } from '../utils/logger';
import { getProviderFromModel, ProviderConfig, DEFAULT_MODELS, PROVIDERS } from '../config/ai-providers';
import { dragonflydb } from '../db/dragonflydb';
import { config } from '../config/env';
import { extractTextFromFile } from './document-processor';
import path from 'path';
import { transcribeAudio, synthesizeSpeech, resolveElevenLabsKey } from './elevenlabs';
import fs from 'fs';

// === Feature flags ===
// Toggle Text-to-Speech. STT (speech-to-text) always remains on for user voice input.
// Set the env var ENABLE_TTS="true" to re-enable in the future without code changes.
const ENABLE_TTS = process.env.ENABLE_TTS === 'true';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface StreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        delta: {
            content?: string | null;
            role?: string;
            // Reasoning-specific fields for models like DeepSeek R1
            reasoning?: string | null;
        };
        finish_reason: string | null;
    }[];
}

// === Title helper (needs to be declared before usage) ===
// A more robust title generator: strips Markdown syntax & filler phrases, then
// takes the first ~10 "meaningful" words so titles read like concise summaries
// instead of random fillers like "Okay, here's…".
const generateSmartTitle = (text: string) => {
  if (!text) return 'New Chat';

  // 1. Strip common markdown tokens / whitespace
  let cleaned = text
    .replace(/^#+\s*/gm, '')        // Remove heading marks
    .replace(/^[>*+-]\s+/gm, '')     // Remove list prefixes
    .replace(/[`*_~]/g, '')          // Remove stray markdown chars
    .replace(/\n+/g, ' ')           // Collapse new-lines
    .trim()
    .replace(/\s+/g, ' ');          // Collapse multi-spaces

  // 2. Skip leading filler words ("Okay", "Sure", "Alright", …)
  const filler = new Set([
    'okay', 'sure', 'alright', 'certainly', 'gladly', 'of', 'course',
    "here's", 'absolutely', 'indeed'
  ]);
  const words = cleaned.split(' ');
  let start = 0;
  while (start < words.length && filler.has(words[start].toLowerCase())) {
    start++;
  }

  // 3. Build candidate (max 10 words / 60 chars)
  const candidate = words.slice(start, start + 10).join(' ');
  const trimmed = candidate.length > 60 ? candidate.slice(0, 57) + '…' : candidate;

  // 4. Capitalise first letter for a polished look
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const handleOpenAICompatibleStream = async (
    chatId: string,
    userId: string,
    provider: ProviderConfig,
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    isDefaultModel: boolean
) => {
    // Get original messages for database storage (with string content)
    const originalMessages = await (async () => {
        const chatState = await dragonflydb.getChatState(chatId);
        return JSON.parse(chatState.messages || '[]');
    })();
    const url = `${provider.baseURL}${provider.apiPath}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
    };

    if (provider.authHeader) {
        headers[provider.authHeader] = provider.authScheme
            ? `${provider.authScheme} ${apiKey}`
            : apiKey;
    }

    let streamSuccessful = false;

    let answerBuffer = '';
    let reasoningBuffer = '';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                model, 
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })), 
                stream: true 
            }),
        });

        if (!response.ok || !response.body) {
            const errorBody = await response.text();
            log.error(`[AI Router] Request to ${provider.provider} failed with status ${response.status}: ${errorBody}`);
            await dragonflydb.appendStream(chatId, `\n\n**Error:** Failed to connect to ${provider.provider}.`);
            return;
        }
        
        await dragonflydb.startStreaming(chatId);

        for await (const chunk of response.body) {
            const decodedChunk = new TextDecoder().decode(chunk);
            const lines = decodedChunk.split('\n').filter(line => line.trim().startsWith('data:'));

            for (const line of lines) {
                const jsonStr = line.replace('data: ', '');
                if (jsonStr === '[DONE]') {
                    streamSuccessful = true;
                    break;
                }
                try {
                    const parsed: StreamChunk = JSON.parse(jsonStr);
                    const content = parsed.choices[0]?.delta?.content;
                    const reasoning = parsed.choices[0]?.delta?.reasoning;
                    
                    if (reasoning) {
                        // Send reasoning as separate message type via WebSocket
                        await dragonflydb.appendStream(chatId, `__REASONING__${reasoning}`);
                        reasoningBuffer += reasoning;
                    } else if (content) {
                        await dragonflydb.appendStream(chatId, content);
                        answerBuffer += content;
                    }
                } catch (e) {
                    log.warn(`[AI Router] Failed to parse stream chunk: ${jsonStr}`, e);
                }
            }
        }
    } catch (error) {
        log.error(`[AI Router] Error during streaming from ${provider.provider}`, error);
        await dragonflydb.appendStream(chatId, `\n\n**Error:** An unexpected error occurred with ${provider.provider}.`);
    } finally {
        // Mark stream finished for pub/sub consumers and clear the temporary stream buffer
        await dragonflydb.finishStreaming(chatId);
        // After we have recovered the full response, we no longer need the temporary stream buffer
        if (!dragonflydb.isFallback) {
          try {
            await dragonflydb.raw.del(`chat:${chatId}:stream`);
          } catch (err) {
            log.warn('[AI Router] Failed to delete stream buffer', { chatId, err });
          }
        }

        // Save the complete message history including the assistant's response and reasoning (if any)
        if (streamSuccessful && answerBuffer) {
            const assistantMsg: Record<string, any> = { role: 'assistant', content: answerBuffer, model };
            if (reasoningBuffer) assistantMsg.reasoning = reasoningBuffer;

            const updatedMessages = [...originalMessages, assistantMsg];
            const chatUpdates: Record<string, string> = {
                messages: JSON.stringify(updatedMessages)
            };
            // Generate title if still placeholder
            const { title: currentTitle } = await dragonflydb.getChatState(chatId);
            if (!currentTitle || currentTitle === 'New Chat') {
                // Generate title from the user's question, not the AI response
                const lastUserMessage = originalMessages.findLast((msg: any) => msg.role === 'user');
                const userQuestion = typeof lastUserMessage?.content === 'string' 
                    ? lastUserMessage.content 
                    : lastUserMessage?.content?.find((part: any) => part.type === 'text')?.text || '';
                chatUpdates.title = generateSmartTitle(userQuestion);
            }
            await dragonflydb.updateChatState(chatId, chatUpdates);
            log.debug(`[AI Router] Saved complete message history for chat ${chatId}`);

            // Kick-off TTS generation in parallel (non-blocking)
            if (ENABLE_TTS) {
            (async () => {
              try {
                const elevenKey = await resolveElevenLabsKey(userId, dragonflydb.getUserKey.bind(dragonflydb));
                if (elevenKey) {
                  const audioDataUrl = await synthesizeSpeech(answerBuffer, elevenKey);
                  if (audioDataUrl) {
                    await dragonflydb.appendStream(chatId, `__TTS__${audioDataUrl}`);

                    // === Persist audio to chat history ===
                    try {
                      const state = await dragonflydb.getChatState(chatId);
                      if (state && state.messages) {
                        const msgs: any[] = JSON.parse(state.messages);
                        if (msgs.length > 0) {
                          const last = msgs[msgs.length - 1];
                          if (last.role === 'assistant') {
                            last.audio = audioDataUrl;
                            await dragonflydb.updateChatState(chatId, { messages: JSON.stringify(msgs) });
                          }
                        }
                      }
                    } catch (err) {
                      log.error('[AI Router] Failed to persist TTS audio', err);
                    }
                  }
                }
              } catch (err) {
                log.error('[AI Router] TTS generation error', err);
              }
            })();
            }
        }
        
        // Increment message counter for default models only if streaming was successful
        if (isDefaultModel && streamSuccessful) {
            const newCount = await dragonflydb.incrementUserMessageCount(userId);
            log.info(`[AI Router] User ${userId} message count incremented to: ${newCount}/${TRIAL_MESSAGE_LIMIT}`);
        }
    }
};

const handleGoogleCompletion = async (
    chatId: string,
    userId: string,
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    isDefaultModel: boolean
) => {
    // Get original messages for database storage (with string content)
    const originalMessages = await (async () => {
        const chatState = await dragonflydb.getChatState(chatId);
        return JSON.parse(chatState.messages || '[]');
    })();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: messages.map(m => {
            const role = m.role === 'assistant' ? 'model' : m.role;
            let parts: any[] = [];
            
            if (typeof m.content === 'string') {
                parts = [{ text: m.content }];
            } else if (Array.isArray(m.content)) {
                parts = m.content.map(part => {
                    if (part.type === 'text') {
                        return { text: part.text };
                    } else if (part.type === 'image_url' && part.image_url?.url) {
                        return {
                            inlineData: {
                                mimeType: 'image/jpeg', // Default, could be improved
                                data: part.image_url.url.split(',')[1] // Remove data:image/jpeg;base64, prefix
                            }
                        };
                    }
                    return { text: '' };
                });
            }
            
            return { role, parts };
        })
    };

    try {
        await dragonflydb.startStreaming(chatId);

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errText = await resp.text();
            log.error(`[AI Router] Google completion failed: ${resp.status} ${errText}`);
            await dragonflydb.appendStream(chatId, `\n\n**Google API Error ${resp.status}:** ${errText}`);
            return;
        }

        const data = await resp.json();
        const text = (data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '').toString();

        for (const char of text) {
            await dragonflydb.appendStream(chatId, char);
        }

        const fullResponse = await dragonflydb.finishStreaming(chatId);
        const updatedMessages = [...originalMessages, { role: 'assistant', content: fullResponse, model }];
        const chatUpdates: Record<string, string> = { messages: JSON.stringify(updatedMessages) };
        const { title: currentTitle } = await dragonflydb.getChatState(chatId);
        if (!currentTitle || currentTitle === 'New Chat') {
          // Generate title from the user's question, not the AI response
          const lastUserMessage = originalMessages.findLast((msg: any) => msg.role === 'user');
          const userQuestion = typeof lastUserMessage?.content === 'string' 
              ? lastUserMessage.content 
              : lastUserMessage?.content?.find((part: any) => part.type === 'text')?.text || '';
          chatUpdates.title = generateSmartTitle(userQuestion);
        }
        await dragonflydb.updateChatState(chatId, chatUpdates);

        if (isDefaultModel) {
            const newCount = await dragonflydb.incrementUserMessageCount(userId);
            log.info(`[AI Router] User ${userId} message count incremented to: ${newCount}/${TRIAL_MESSAGE_LIMIT}`);
        }
    } catch (err) {
        log.error('[AI Router] Google completion handler error', err);
        await dragonflydb.appendStream(chatId, `\n\n**Error:** Failed to call Google Gemini API.`);
    }
};

// === Trial system ===
// Centralised constant so the limit is easy to tweak from a single place.
export const TRIAL_MESSAGE_LIMIT = 50;
export const TRIAL_VOICE_LIMIT = 2;

export const routeChat = async (userId: string, chatId: string, attachments?: Array<{ id: string; name: string; type: string; url?: string; base64?: string; text?: string }>) => {
    log.info(`[AI Router] Routing chat ${chatId} for user ${userId}`);

    const chatState = await dragonflydb.getChatState(chatId);
    if (!chatState) {
        log.error(`[AI Router] Could not find chat state for chat ID: ${chatId}`);
        return;
    }

    const { model, messages: messagesStr } = chatState;
    const messages: ChatMessage[] = JSON.parse(messagesStr || '[]');

    // Process attachments for the last user message if any
    let processedMessages = [...messages];
    let isVoiceChat = false; // Flag so we later know to TTS the assistant reply
    if (attachments && attachments.length > 0 && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'user') {
            const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
            
            // Start with original text content
            let textContent = '';
            if (typeof lastMessage.content === 'string' && lastMessage.content.trim()) {
                textContent = lastMessage.content;
            }
            
            // Process each attachment
            for (const att of attachments) {
                if (att.type.startsWith('image/') && att.base64) {
                    // Handle images as before
                    contentParts.push({
                        type: 'image_url',
                        image_url: { url: att.base64 }
                    });
                } else if (att.type.startsWith('audio/')) {
                    // === Audio attachment: transcribe via ElevenLabs ===
                    isVoiceChat = true;
                    let transcription = '';
                    let audioPath = '';
                    let tempPath: string | null = null; // track temp file for cleanup
                    try {
                        // 1) Prefer base64 data if present (most reliable)
                        if (att.base64) {
                            const base64Data = att.base64.split(',')[1];
                            tempPath = path.join(process.cwd(), 'uploads', `${Date.now()}_${att.id}.webm`);
                            await fs.promises.writeFile(tempPath, base64Data, 'base64');
                            audioPath = tempPath;
                        } else if (att.url) {
                            if (att.url.startsWith('http')) {
                                // Remote (e.g. Cloudinary) URL – download to temp file first
                                const resp = await fetch(att.url);
                                if (!resp.ok) {
                                    throw new Error(`Failed to download audio file (${resp.status})`);
                                }
                                const arrBuf = await resp.arrayBuffer();
                                tempPath = path.join(process.cwd(), 'uploads', `${Date.now()}_${path.basename(att.url)}`);
                                await fs.promises.writeFile(tempPath, Buffer.from(arrBuf));
                                audioPath = tempPath;
                            } else {
                                // Local /uploads path (sent directly from client)
                                audioPath = path.join(process.cwd(), 'uploads', path.basename(att.url));
                            }
                        }

                        const elevenKey = await resolveElevenLabsKey(userId, dragonflydb.getUserKey.bind(dragonflydb));

                        if (!elevenKey) {
                            log.warn('[AI Router] ElevenLabs key missing for STT');
                        } else {
                            // === Trial limit enforcement for shared key ===
                            const isUsingSharedKey = !(await dragonflydb.getUserKey(userId, 'elevenlabs'));
                            if (isUsingSharedKey) {
                                const voiceCount = await dragonflydb.getUserVoiceCount(userId);
                                if (voiceCount >= TRIAL_VOICE_LIMIT) {
                                    await dragonflydb.appendStream(chatId, `\n\n**Voice Trial Limit Reached (${TRIAL_VOICE_LIMIT})**`);
                                    return; // Abort routing – user exhausted voice quota
                                }
                                await dragonflydb.incrementUserVoiceCount(userId);
                            }

                            transcription = await transcribeAudio(audioPath, elevenKey);
                        }
                    } catch (err) {
                        log.error('[AI Router] Failed to transcribe audio', err);
                    } finally {
                        // Cleanup temp file if we created one
                        if (tempPath) {
                            fs.promises.unlink(tempPath).catch(() => { /* ignore */ });
                        }
                    }

                    if (transcription) {
                        textContent += (textContent ? '\n' : '') + transcription;
                    }
                } else if (att.type === 'application/pdf' || 
                          att.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                          att.type === 'application/msword') {
                    // Prefer pre-extracted text if present (no download required)
                    if (att.text) {
                        textContent += `\n\n[Document: ${att.name}]\n${att.text}`;
                        continue; // Skip further processing
                    }

                    // Otherwise attempt to fetch/download & extract
                    if (att.url) {
                        let docPath: string | null = null;
                        let tempPath: string | null = null;

                        try {
                            // Determine if the URL is remote (e.g., Cloudinary) or local /uploads path
                            if (/^https?:/.test(att.url)) {
                                // Remote URL – try to download, but fallback to local file if it fails
                                let downloadUrl = att.url;
                                let resp = await fetch(downloadUrl);
                                if (resp.status === 401 && downloadUrl.includes('/image/upload/')) {
                                    // Some PDFs are stored under resource_type raw – swap the segment and retry
                                    downloadUrl = downloadUrl.replace('/image/upload/', '/raw/upload/');
                                    resp = await fetch(downloadUrl);
                                }
                                if (!resp.ok) {
                                    throw new Error(`Failed to download document (${resp.status})`);
                                }
                                const arrBuf = await resp.arrayBuffer();
                                tempPath = path.join(process.cwd(), 'uploads', `${Date.now()}_${path.basename(downloadUrl)}`);
                                await fs.promises.writeFile(tempPath, Buffer.from(arrBuf));
                                docPath = tempPath;
                            } else {
                                // Local path (starts with /uploads or similar)
                                docPath = path.join(process.cwd(), 'uploads', path.basename(att.url));
                            }

                            const docContent = await extractTextFromFile(docPath, att.type);

                            if (docContent.error) {
                                log.warn(`Failed to extract text from ${att.name}: ${docContent.error}`);
                                textContent += `\n\n[Document: ${att.name} - Error: ${docContent.error}]`;
                            } else if (docContent.text) {
                                textContent += `\n\n[Document: ${att.name}]\n${docContent.text}`;
                            }
                        } catch (err) {
                            const errorMsg = err instanceof Error ? err.message : String(err);
                            log.error(`[AI Router] Failed to process document ${att.name}: ${errorMsg}`, { error: err, url: att.url, type: att.type });
                            textContent += `\n\n[Document: ${att.name} - Error: ${errorMsg}]`;
                        } finally {
                            if (tempPath) {
                                fs.promises.unlink(tempPath).catch(() => { /* ignore */ });
                            }
                        }
                    }
                }
            }
            
            // Add the combined text content
            if (textContent.trim()) {
                contentParts.push({ type: 'text', text: textContent });
            }
            
            // Create a copy of messages with multimodal content for AI processing
            // but keep the original string content for database storage
            if (contentParts.length > 0) {
                processedMessages = [...messages];
                processedMessages[processedMessages.length - 1] = {
                    ...lastMessage,
                    content: contentParts
                };
            }
        }
    }

    // Determine provider prefix from model id
    const providerPrefix = model.split('/')[0];

    // Retrieve any stored API keys we may need for routing decisions
    const openrouterKey = await dragonflydb.getUserKey(userId, 'openrouter');
    const providerSpecificKey = await dragonflydb.getUserKey(userId, providerPrefix);

    // Default models apply only when the user does NOT have a BYOK key **for that provider** and also no OpenRouter key.
    const isDefaultModel = DEFAULT_MODELS.some(m => m.id === model) && !providerSpecificKey && !openrouterKey;
    
    // Check message limit for default models (trial period)
    if (isDefaultModel) {
        const messageCount = await dragonflydb.getUserMessageCount(userId);
        const MESSAGE_LIMIT = TRIAL_MESSAGE_LIMIT;
        
        if (messageCount >= MESSAGE_LIMIT) {
            await dragonflydb.appendStream(chatId, `\n\n**Trial Limit Reached** 🚀\n\nYou've used all ${MESSAGE_LIMIT} free messages! To continue chatting:\n\n1. **Add your API key** in the settings panel →\n2. **Choose from providers**: OpenAI, Anthropic, Google, Groq\n3. **Enjoy unlimited conversations**\n\nThanks for trying Xpochat!`);
            const fullResponse = await dragonflydb.finishStreaming(chatId);
            // Save trial limit message to history
            if (fullResponse) {
                const updatedMessages = [...messages, { role: 'assistant', content: fullResponse, model }];
                await dragonflydb.updateChatState(chatId, {
                    messages: JSON.stringify(updatedMessages)
                });
            }
            log.info(`[AI Router] User ${userId} has reached the ${MESSAGE_LIMIT} message limit`);
            return;
        }
        
        log.info(`[AI Router] User ${userId} message count: ${messageCount}/${MESSAGE_LIMIT}`);
    }
    
    // === Decide which provider endpoint to call ===
    let providerName: string = providerPrefix;
    let provider = null as ProviderConfig | null;
    let apiKey: string | null = null;

    if (isDefaultModel) {
        // Trial/default models always go through OpenRouter (shared key first, then user's OpenRouter key)
        providerName = 'openrouter';
        provider = PROVIDERS['openrouter'];
        apiKey = config.OPENROUTER_API_KEY || openrouterKey;
    } else if (providerSpecificKey) {
        // User has a native key for the provider indicated by the model prefix – route directly.
        providerName = providerPrefix;
        provider = getProviderFromModel(model);
        apiKey = providerSpecificKey;
    } else if (openrouterKey) {
        // Fallback: route via OpenRouter if user *only* provided an OpenRouter key.
        providerName = 'openrouter';
        provider = PROVIDERS['openrouter'];
        apiKey = openrouterKey;
    }

    // Validate we resolved provider & key
    if (!provider) {
        await dragonflydb.appendStream(chatId, `\n\n**Error:** Provider for model **${model}** is not configured.`);
        log.error(`[AI Router] Provider not found for model ${model}`);
        return;
    }

    if (!apiKey) {
        await dragonflydb.appendStream(chatId, `\n\n**Error:** API Key for **${providerName}** not found. Please add it in the settings.`);
        log.error(`[AI Router] API key not found for user ${userId} and provider ${providerName}`);
        return;
    }
    
    // Prepare model id for the downstream API
    let modelForProvider = model;
    if (provider.provider === 'openrouter') {
        // If the id is prefixed with "openrouter/" (e.g., "openrouter/google/gemini...")
        // strip that prefix because OpenRouter expects the raw id ("google/gemini...")
        if (model.startsWith('openrouter/')) {
            modelForProvider = model.slice('openrouter/'.length);
        }
    } else {
        // For native providers, remove their own prefix ("google/..." -> "gemini/...")
        const withoutPrefix = model.split('/').slice(1).join('/');
        if (withoutPrefix) {
            modelForProvider = withoutPrefix;
        }
    }

    // === TTS hook ===
    async function maybeTTSAssistantAnswer(fullAnswer: string) {
      if (!ENABLE_TTS || !isVoiceChat) return;
      const elevenKey = await resolveElevenLabsKey(userId, dragonflydb.getUserKey.bind(dragonflydb));
      if (!elevenKey) return; // no key, skip

      const audioDataUrl = await synthesizeSpeech(fullAnswer, elevenKey);
      if (!audioDataUrl) return;

      // Publish via Redis so subscribed sockets receive it.
      await dragonflydb.appendStream(chatId, `__TTS__${audioDataUrl}`);

      // === Persist audio to chat history ===
      try {
        const state = await dragonflydb.getChatState(chatId);
        if (state && state.messages) {
          const msgs: any[] = JSON.parse(state.messages);
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            if (last.role === 'assistant') {
              last.audio = audioDataUrl;
              await dragonflydb.updateChatState(chatId, { messages: JSON.stringify(msgs) });
            }
          }
        }
      } catch (err) {
        log.error('[AI Router] Failed to persist TTS audio', err);
      }
    }

    // Wrap finishStreaming BEFORE we launch the provider handler so we catch the soon-to-happen call.
    const originalFinish = dragonflydb.finishStreaming.bind(dragonflydb);
    dragonflydb.finishStreaming = async (cid: string) => {
        const full = await originalFinish(cid);
        if (cid === chatId) {
          await maybeTTSAssistantAnswer(full);
        }
        // restore immediately so parallel chats aren't affected.
        dragonflydb.finishStreaming = originalFinish;
        return full;
    };

    // For now, we only handle OpenAI-compatible streams.
    // Stubs for other providers will be added here.
    switch (provider.provider) {
        case 'openrouter':
        case 'openai':
        case 'groq':
            return handleOpenAICompatibleStream(chatId, userId, provider, apiKey, modelForProvider, processedMessages, isDefaultModel);
        case 'anthropic':
            // TODO: Implement Anthropic-specific stream handling
            log.warn(`[AI Router] Anthropic provider not yet implemented.`);
            await dragonflydb.appendStream(chatId, `\n\n**Note:** The Anthropic provider is not yet implemented.`);
            return;
        case 'google':
            return handleGoogleCompletion(chatId, userId, apiKey, modelForProvider, processedMessages, isDefaultModel);
        default:
            log.error(`[AI Router] Unknown provider: ${provider.provider}`);
            await dragonflydb.appendStream(chatId, `\n\n**Error:** The provider ${provider.provider} is not supported.`);
            return;
    }
}; 