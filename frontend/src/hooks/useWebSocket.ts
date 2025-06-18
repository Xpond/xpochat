import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string; // For reasoning models like DeepSeek R1
  reasoningOpen?: boolean; // Controls dropdown open state
  audio?: string; // base64 audio for playback (assistant)
  attachments?: Array<{ id: string; name: string; type: string; url?: string; base64?: string }>;
  model?: string; // Model id used for assistant response (e.g., google/gemini-1.5)
  streaming?: boolean; // True while response is still streaming
  timestamp: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  hasJoined: boolean;
  messages: Message[];
  sendMessage: (content: string, model: string, fullMessageHistory: Message[], attachments?: any[]) => void;
  isTyping: boolean;
  isProcessing: boolean;
  error: string | null;
  resetMessages: () => void;
  replaceMessages: (msgs: Message[]) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export const useWebSocket = (chatId: string): UseWebSocketReturn => {
  const { getToken } = useAuth();
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // === Ultra-smooth streaming queue ===
  // Queue of individual characters to render; keeps UI feather-light while showing
  // a steady drip instead of bursty chunks.
  const charQueueRef = useRef<string[]>([]);
  const currentModelRef = useRef<string>('');
  const streamFinishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  // Streaming speed is configurable via env. `NEXT_PUBLIC_STREAMING_SPEED` is expected to be
  // "words per second" (WPS). We convert that to an approximate number of characters to
  // render per animation frame based on a 60 fps render loop and an average word length.
  const DEFAULT_WPS = 15; // fallback when the env var is missing or invalid
  const AVERAGE_CHARS_PER_WORD = 5; // rough heuristic – tweak if necessary
  const wordsPerSecond = parseFloat(process.env.NEXT_PUBLIC_STREAMING_SPEED || `${DEFAULT_WPS}`);
  const CHARS_PER_FRAME = Math.max(
    1,
    Math.round((wordsPerSecond * AVERAGE_CHARS_PER_WORD) / 60)
  ); // higher = faster (fewer reflows)

  // Keep a mutable reference to the latest chatId so that event handlers created
  // once (like ws.onmessage) can always access the up-to-date value without
  // needing to be re-attached.
  const chatIdRef = useRef(chatId);

  // Update the ref on every chatId change.
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  const appendCharsToMessage = useCallback((chars: string) => {
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          { ...lastMsg, content: lastMsg.content + chars },
        ];
      }
      return [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: chars,
          model: currentModelRef.current,
          streaming: true,
          reasoningOpen: false,
          timestamp: Date.now(),
        },
      ];
    });
  }, []);

  const appendReasoningToMessage = useCallback((reasoning: string) => {
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          { ...lastMsg, reasoning: (lastMsg.reasoning || '') + reasoning, reasoningOpen: true },
        ];
      }
      return [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: '',
          reasoning: reasoning,
          model: currentModelRef.current,
          streaming: true,
          reasoningOpen: true,
          timestamp: Date.now(),
        },
      ];
    });

    // Reset finish timer as we received new data
    if (streamFinishTimeoutRef.current) clearTimeout(streamFinishTimeoutRef.current);
    streamFinishTimeoutRef.current = setTimeout(markStreamingDone, 750);
  }, []);

  const processQueue = useCallback(() => {
    if (charQueueRef.current.length === 0) {
      processingRef.current = false;
      return;
    }

    // Pop up to CHARS_PER_FRAME characters this frame for smooth flow
    const chunkSize = CHARS_PER_FRAME;
    const chunk = charQueueRef.current.splice(0, chunkSize).join('');
    appendCharsToMessage(chunk);

    // Schedule next frame if there is more.
    requestAnimationFrame(processQueue);
  }, [appendCharsToMessage]);

  const markStreamingDone = useCallback(() => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
  }, []);

  const enqueueChars = (text: string) => {
    // Push each character so we control granularity.
    // Using spread is okay on small strings (tokens are short).
    charQueueRef.current.push(...[...text]);
    // Reset finish timer
    if (streamFinishTimeoutRef.current) clearTimeout(streamFinishTimeoutRef.current);
    streamFinishTimeoutRef.current = setTimeout(markStreamingDone, 750);
    if (!processingRef.current) {
      processingRef.current = true;
      requestAnimationFrame(processQueue);
    }
  };

  const connect = useCallback(async () => {
    // If a socket is already OPEN or in the middle of CONNECTING, do not start a
    // second concurrent connection. This prevents race conditions where the
    // handler of an earlier socket fires but `ws.current` has already been
    // reassigned to a newer socket, causing `ws.current.send` to throw the
    // "Still in CONNECTING state" error.
    if (
      ws.current &&
      (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)
    ) {
      // console.log('[WebSocket] Already connected or connecting.');
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        // console.log('[WebSocket] Authentication token not available. Will retry shortly.');
        // Retry again soon – Clerk may still be initialising when the component mounts
        setTimeout(connect, 1000);
        return;
      }

      // Build WebSocket endpoint URL
      // For local development: connect directly to backend on localhost:3001
      // For Railway production: use NEXT_PUBLIC_WS_URL environment variable
      const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
      let wsUrl;
      
      if (envWsUrl) {
        // Explicit URL provided (could be gateway or backend public URL)
        wsUrl = `${envWsUrl}?token=${token}`;
      } else if (window.location.hostname === 'localhost') {
        // Local development: connect directly to backend
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//localhost:3001?token=${token}`;
      } else {
        // Production default: hit the same host's /ws path (handled by custom server proxy)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
      }
      
      // console.log(`[WebSocket] Connecting to ${wsUrl}`);

      // Create a new socket and keep a *local* reference so that the event
      // handlers interact with the correct instance even if `ws.current` is
      // later overwritten by a reconnection attempt.
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        // console.log('[WebSocket] Connection opened.');
        setIsConnected(true);
        setError(null);
        setHasJoined(false);
        
        // Join the specific chat room using the same socket that just opened.
        socket.send(
          JSON.stringify({
          type: 'join',
            chatId,
          })
        );

        // Optimistically mark as joined. The server will still reply with a
        // "joined" message, which will keep `hasJoined` true. This prevents
        // the UI from being stuck in a disabled "Connecting…" state if the
        // confirmation packet is delayed or dropped.
        setHasJoined(true);
      };

      socket.onmessage = (event) => {
        // Handle both string and Blob payloads
        const handleMessage = (raw: string) => {
          try {
            const data = JSON.parse(raw);
            
            if (data.type === 'joined') {
              setHasJoined(true);
            } else if (data.type === 'token' && data.chatId === chatIdRef.current) {
              setIsProcessing(false);
              enqueueChars(data.content);
            } else if (data.type === 'reasoning' && data.chatId === chatIdRef.current) {
              setIsProcessing(false);
              appendReasoningToMessage(data.content);
            } else if (data.type === 'tts' && data.chatId === chatIdRef.current) {
              // Attach audio to the last assistant message
              setMessages(prev => {
                if (prev.length === 0) return prev;
                const last = prev[prev.length - 1];
                if (last.role === 'assistant') {
                  const newMsg = { ...last, audio: data.audio };
                  try {
                    const aud = new Audio(data.audio);
                    aud.play().catch(() => {});
                  } catch(_) {}
                  return [...prev.slice(0, -1), newMsg];
                }
                return prev;
              });
            } else if (data.type === 'typing' && data.chatId === chatIdRef.current) {
              setIsTyping(data.isTyping);
            } else if (data.type === 'error') {
              setIsProcessing(false);
              setError(data.message);
            } else if (data.type === 'stream-progress' && data.chatId === chatIdRef.current) {
              if (data.content) {
                const parts = data.content.split('__REASONING__');
                const answerPart = parts.shift() || '';
                const reasoningPart = parts.join('');
                setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  const mergeInto = (base: Message | null): Message => {
                    if (base) {
                      return {
                        ...base,
                        content: answerPart || base.content,
                        reasoning: reasoningPart ? ((base.reasoning || '') + reasoningPart) : base.reasoning,
                        reasoningOpen: base.reasoningOpen ?? false,
                      } as Message;
                    }
                    return {
                      id: Date.now().toString(),
                      role: 'assistant',
                      content: answerPart,
                      reasoning: reasoningPart || undefined,
                      reasoningOpen: !!reasoningPart,
                      timestamp: Date.now(),
                    } as Message;
                  };
                  if (lastMsg && lastMsg.role === 'assistant') {
                    return [
                      ...prev.slice(0, -1),
                      mergeInto(lastMsg),
                    ];
                  }
                  return [...prev, mergeInto(null)];
                });
              }
            }
          } catch (err) {
            // Silently ignore malformed payloads in production but log in dev
            if (process.env.NODE_ENV !== 'production') {
              if (process.env.NODE_ENV === 'development') {
          console.error('[WebSocket] Failed to parse message', err, raw);
        }
            }
          }
        };

        if (typeof event.data === 'string') {
          handleMessage(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then(handleMessage).catch(() => {});
        }
      };

      socket.onclose = (event) => {
        // console.log('[WebSocket] Connection closed:', event);
        setIsConnected(false);
        setIsProcessing(false); // Stop processing on disconnect
        // Auto-reconnect unless closed intentionally (code 1000)
        if (event.code !== 1000) {
          setError('Connection lost. Reconnecting...');
          setTimeout(connect, 3000);
        }
      };

      socket.onerror = (error) => {
        // console.error('[WebSocket] Error:', error);
        setError('Connection failed');
        setIsConnected(false);
        setIsProcessing(false); // Stop processing on error
      };

    } catch (err) {
      setError('Failed to connect');
      setIsProcessing(false);
    }
  }, [getToken, chatId]);

  const sendMessage = useCallback((content: string, model: string, fullMessageHistory: Message[], attachments?: any[]) => {
    if (ws.current?.readyState === WebSocket.OPEN && hasJoined) {
      currentModelRef.current = model;
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        attachments: (attachments || []).map(a => ({ id: a.id, name: a.name, type: a.type, url: a.url, base64: a.base64 })),
        timestamp: Date.now()
      };
      
      const updatedMessages = [...fullMessageHistory, userMessage];
      setMessages(updatedMessages);
      
      // Start processing indicator when message is sent
      setIsProcessing(true);

      ws.current.send(JSON.stringify({
        type: 'chat',
        chatId,
        model,
        messages: updatedMessages.map(({ id, timestamp, ...rest }) => rest), // Strip client-only fields
        content, // Keep for consistency, though backend uses messages array
        attachments: attachments || [] // Include attachments for AI processing
      }));
    }
  }, [chatId, hasJoined]);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
    };
  }, [connect]);

  // Reset messages when switching chats from outside the hook
  const resetMessages = useCallback(() => {
    // Clear message list displayed in UI
    setMessages([]);
    // Reset UI processing indicators
    setIsProcessing(false);

    // --- Prevent chat-bleeding -------------------------------------------------
    // If we switch to another chat while the previous one is still streaming,
    // there may be characters left in the queue or an animation frame that
    // will attempt to flush them.  Clearing both the queue _and_ the flag
    // ensures no tokens from the previous chat leak into the new chat.
    charQueueRef.current = [];
    processingRef.current = false;
  }, []);

  // Re-join the new chat room whenever the chatId prop changes
  useEffect(() => {
    const attemptJoin = () => {
      if (!ws.current) return;

      if (ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'join', chatId }));

        // Don't clear messages or queue - let streams continue in background
        // The chat history loading will handle showing the correct messages
        setIsProcessing(false);
        setHasJoined(false);
      } else if (ws.current.readyState === WebSocket.CONNECTING) {
        // Wait a bit and try again — the socket is still hand-shaking
        setTimeout(attemptJoin, 300);
      } else if (ws.current.readyState === WebSocket.CLOSED) {
        // Reconnect (connect handles idempotency)
        connect();
        setTimeout(attemptJoin, 500);
      }
    };

    attemptJoin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const replaceMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    setIsProcessing(false); // Reset processing when replacing messages
  }, []);

  return { isConnected, hasJoined, messages, sendMessage, isTyping, isProcessing, error, resetMessages, replaceMessages, setMessages };
}; 