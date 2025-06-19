'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { useWebSocket } from "../../hooks/useWebSocket";
import MessageList from '../../components/chat/MessageList';
import ChatInputArea from '../../components/chat/ChatInputArea';
import ChatHistoryPanel, { ChatMeta } from '../../components/chat/ChatHistoryPanel';
import SettingsPanel from '../../components/chat/SettingsPanel';
import MobileChatLayout from '../../components/chat/MobileChatLayout';
import { fetchWithAuth } from '../../utils/fetchWithAuth';

// --- EASY UI CUSTOMIZATION ---
const LEFT_PANEL_WIDTH = '15%';    // e.g., '20%', '25%', '30%'
const RIGHT_PANEL_WIDTH = '15%';   // e.g., '20%', '25%', '30%'
// The centre chat container will now dynamically resize depending on which side panels are open.
// With both panels open it matches the previous 50%. With one panel open it expands slightly, and
// with both panels closed it expands even further for an immersive full-width feel.
// (Exact values chosen after some quick manual testing – tweak if desired.)
const CHAT_MAX_WIDTH = '68%';    // Tweak this value to adjust the main chat window's width.
const CHAT_HEIGHT = '97.5%';       // Tweak this value to adjust the main chat window's height.

// --- WELCOME SUGGESTIONS ---
const STARTER_SUGGESTIONS = [
  'What can you do?',
  'Explain quantum computing like I\'m five',
  'Give me a productivity tip',
  'Suggest a healthy dinner recipe',
  'Teach me something interesting about space',
];

export default function ChatPage() {
  // --- HOOKS ---
  // All hooks are now declared at the top level, in the same order on every render.
  const { isLoaded, userId, getToken } = useAuth();
  
  // Detect mobile on first render (SSR safe) so UI state is correct before initial paint
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024; // lg breakpoint – keep in sync with CSS media query
  });
  
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedModel, _setSelectedModel] = useState('google/gemini-2.5-flash-preview-05-20'); // Default to first default model
  const [selectedColor, setSelectedColor] = useState('#002421');
  const [gradientType, setGradientType] = useState('solid');
  const [containerOpacity, setContainerOpacity] = useState(0);
  const [fontSize, setFontSize] = useState(90);
  const [chatFontSize, setChatFontSize] = useState(100);
  const [apiKeys, setApiKeys] = useState<{[key: string]: string}>({});
  const [showApiKey, setShowApiKey] = useState<{[key: string]: boolean}>({});
  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('xpochat:lastChatId') || '';
  });
  interface ModelMeta { id: string; name?: string; description?: string; }
  interface ModelsState { defaultModels: ModelMeta[]; byokProviders: Record<string, ModelMeta[]>; }
  const [models, setModels] = useState<ModelsState>({ defaultModels: [], byokProviders: {} });
  const [activeApiKeys, setActiveApiKeys] = useState<string[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [messageLimit, setMessageLimit] = useState(50);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  // Ref to keep track of the polling interval so we can clear it on unmount
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // === NEW: refs to debounce theme persistence for opacity & font size ===
  const opacityUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontSizeUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatFontSizeUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // === NEW: Track when user is actively adjusting theme settings ===
  const [isAdjustingTheme, setIsAdjustingTheme] = useState(false);
  const themeAdjustmentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebSocket connection for real-time chat
  const { isConnected, hasJoined, messages, sendMessage, isTyping, isProcessing, error, resetMessages, setMessages } = useWebSocket(currentChatId);

  // Width (in pixels) of the invisible edge hover area that auto-opens the panels.
  const HOVER_ZONE_WIDTH = 200;

  // === EARLY THEME LOADING - PREVENTS FLASH ===
  // Apply saved theme immediately before first render to prevent FOUC
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !userId) return;
    
    // Synchronously load theme from localStorage cache first (if available)
    const cachedTheme = localStorage.getItem(`xpochat:theme:${userId}`);
    if (cachedTheme) {
      try {
        const theme = JSON.parse(cachedTheme);
        applyThemeImmediate(theme.color, theme.gradientType, theme.containerOpacity, theme.fontSize, theme.chatFontSize);
      } catch (e) {
        // Ignore cache errors, will load from backend
      }
    }
  }, [userId]);

  // Helper function to apply theme immediately without state updates
  const applyThemeImmediate = (color: string, gradType: string, containerOpacity?: number, fontSize?: number, chatFontSize?: number) => {
    if (typeof document === 'undefined') return;
    
    // Apply CSS variables immediately
    document.documentElement.style.setProperty('--teal-primary', color);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    document.documentElement.style.setProperty('--teal-primary-rgb', `${r}, ${g}, ${b}`);
    
    // Apply other theme properties
    if (containerOpacity !== undefined) {
      const actualOpacity = 0.9 - (containerOpacity * 0.8) / 100;
      document.documentElement.style.setProperty('--container-opacity', actualOpacity.toString());
    }
    if (fontSize !== undefined) {
      const actualFontSize = 0.75 + (fontSize - 50) * 0.5 / 100;
      document.documentElement.style.setProperty('--container-font-size', `${actualFontSize}rem`);
    }
    if (chatFontSize !== undefined) {
      const actualChat = 0.75 + (chatFontSize - 50) * 0.5 / 100;
      document.documentElement.style.setProperty('--chat-font-size', `${actualChat}rem`);
    }
    
    // Apply background gradient
    const getBackground = (color: string, gradType: string) => {
      const baseColor = color || '#1a4a4a';
      switch(gradType) {
        case 'linear-diagonal':
          return `linear-gradient(135deg, #0a0a0a 0%, ${baseColor} 100%)`;
        case 'radial':
          return `radial-gradient(circle at 50% 50%, ${baseColor} 0%, #0a0a0a 100%)`;
        case 'linear-vertical':
          return `linear-gradient(180deg, #0a0a0a 0%, ${baseColor} 100%)`;
        case 'linear-horizontal':
          return `linear-gradient(90deg, #0a0a0a 0%, ${baseColor} 100%)`;
        default:
          return baseColor;
      }
    };
    
    const background = getBackground(color, gradType);
    const style = document.createElement('style');
    style.innerHTML = `
      body { background: ${background} !important; background-attachment: fixed; }
      * { color: white !important; text-shadow: none !important; -webkit-font-smoothing: antialiased !important; }
    `;
    document.getElementById('dynamic-theme')?.remove();
    style.id = 'dynamic-theme';
    document.head.appendChild(style);
  };

  // === Default Model Persistence ===
  const fetchDefaultModel = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, '/api/user/default-model', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response) return;
      if (!response.ok) throw new Error('Failed to fetch default model');
      const data = await response.json();
      if (data.model) {
        _setSelectedModel(data.model);
      }
    } catch (err) {
      // console.error('Error fetching default model', err);
    }
  }, [getToken]);

  const saveDefaultModel = useCallback(async (modelId: string) => {
    try {
      await fetchWithAuth(getToken, '/api/user/default-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      });
    } catch (err) {
      // console.error('Error saving default model', err);
    }
  }, [getToken]);

  const handleSelectModel = useCallback((modelId: string) => {
    _setSelectedModel(modelId);
    saveDefaultModel(modelId);
  }, [saveDefaultModel]);

  // Load saved model on initial mount
  useEffect(() => {
    if (isLoaded) {
      fetchDefaultModel();
    }
  }, [isLoaded, fetchDefaultModel]);

  // --- DATA FETCHING FUNCTIONS ---
  const fetchApiKeys = useCallback(async () => {
    try {
        const token = await getToken();
        const response = await fetchWithAuth(getToken, '/api/user/keys/all', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response) return;
        if (!response.ok) throw new Error('Failed to fetch API keys');
        const data = await response.json();
        setApiKeys(data.keys || {});
    } catch (error) {
//      console.error("Error fetching api keys:", error);
    }
  }, [getToken]);

  const fetchModels = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, '/api/models', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response) return;
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      setModels(data);
    } catch (error) {
//      console.error('Error fetching models:', error);
    }
  }, [getToken]);

  const fetchActiveKeys = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, '/api/user/keys', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response) return;
      if (!response.ok) throw new Error('Failed to fetch keys');
      const data = await response.json();
      setActiveApiKeys(data.activeKeys || []);
    } catch (error) {
//      console.error('Error fetching active keys:', error);
    }
  }, [getToken]);

  const fetchChats = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, '/api/chats', { headers: { Authorization: `Bearer ${token}` } });
      if (!response) return;
      if (!response.ok) throw new Error('Failed to fetch chats');
      const data = await response.json();
      setChats((prev) => {
        const serverChats: ChatMeta[] = data.chats || [];
        const merged = serverChats.map((srv) => {
          const local = prev.find((c) => c.id === srv.id);
          if (local && local.title !== 'New Chat' && srv.title === 'New Chat') {
            return { ...srv, title: local.title };
          }
          return srv;
        });
        // Include any local-only chats (not yet persisted)
        const localOnly = prev.filter((c) => !merged.some((m) => m.id === c.id));
        return [...localOnly, ...merged].sort((a, b) => b.created - a.created);
      });
      // If no current chat selected, choose first or create new
      setCurrentChatId((prev) => {
        if (prev) return prev; // already have (possibly from localStorage)
        return (data.chats[0]?.id) || `chat_${Date.now()}`;
      });
    } catch (err) {
//      console.error('Error fetching chats', err);
    }
  }, [getToken]);

  const fetchMessageCount = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, '/api/user/message-count', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response) return;
      if (!response.ok) throw new Error('Failed to fetch message count');
      const data = await response.json();
      setMessageCount(data.messageCount ?? 0);
      setMessageLimit(data.limit ?? 50);
    } catch (error) {
//      console.error("Error fetching message count:", error);
    }
  }, [getToken]);

  const loadSavedTheme = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, '/api/user/theme', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response) return;
      if (!response.ok) throw new Error('Failed to fetch theme');
      const data = await response.json();
      const { color, gradientType, containerOpacity, fontSize, chatFontSize: savedChatFontSize } = data.theme;
      
      // Cache theme data in localStorage for early loading on next visit
      if (userId) {
        try {
          localStorage.setItem(`xpochat:theme:${userId}`, JSON.stringify({
            color, gradientType, containerOpacity, fontSize, chatFontSize: savedChatFontSize
          }));
        } catch (e) {
          // Ignore localStorage errors
        }
      }
      
      setSelectedColor(color);
      setGradientType(gradientType);
      if (containerOpacity !== undefined) {
        setContainerOpacity(containerOpacity);
        // Apply the same opacity mapping as in the settings panel
        const actualOpacity = 0.9 - (containerOpacity * 0.8) / 100;
        document.documentElement.style.setProperty('--container-opacity', actualOpacity.toString());
      }
      if (fontSize !== undefined) {
        setFontSize(fontSize);
        // Apply the same font size mapping as in the settings panel
        const actualFontSize = 0.75 + (fontSize - 50) * 0.5 / 100;
        document.documentElement.style.setProperty('--container-font-size', `${actualFontSize}rem`);
      }
      if (savedChatFontSize !== undefined) {
        setChatFontSize(savedChatFontSize);
        const actualChat = 0.75 + (savedChatFontSize - 50) * 0.5 / 100;
        document.documentElement.style.setProperty('--chat-font-size', `${actualChat}rem`);
      }
      changeTheme(color, gradientType);
    } catch (error) {
//      console.error('Error loading saved theme:', error);
    }
  }, [getToken, changeTheme, userId]);

  // Add loading state for chat switching
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Insert handleSelectChat after hook definitions, e.g., after fetchMessageCount or fetchChats definitions but before side effects.
  const handleSelectChat = useCallback(async (chatId: string) => {
    if (chatId === currentChatId) return;

    // Show loading spinner & clear current view immediately to avoid bleed
    setIsLoadingChat(true);
    resetMessages();

    // Switch chatId so WebSocket joins the new room ASAP
    setCurrentChatId(chatId);

    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, `/api/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response && response.ok) {
        const data = await response.json();
        const parsedMsgs = JSON.parse(data.chat.messages || '[]').map((m: any, idx: number) => ({
          id: `${chatId}-${idx}`,
          role: m.role,
          ...(() => {
            if (m.reasoning) return { content: m.content, reasoning: m.reasoning };
            if (typeof m.content === 'string' && m.content.includes('__REASONING__')) {
              const segments = m.content.split('__REASONING__');
              const answer = segments.shift() || '';
              const reasoningCollected = segments.join('');
              return { content: answer, reasoning: reasoningCollected };
            }
            return { content: m.content };
          })(),
          ...(m.audio ? { audio: m.audio } : {}),
          ...(m.attachments ? { attachments: m.attachments } : {}),
          ...(m.model ? { model: m.model } : {}),
          streaming: false,
          reasoningOpen: false,
          timestamp: Date.now(),
        }));

        setMessages(parsedMsgs);
      }
    } catch (err) {
      console.error('Error loading chat history:', err);
    } finally {
      setIsLoadingChat(false);
    }
  }, [currentChatId, getToken, resetMessages, setMessages]);

  // === NEW: Helper to track theme adjustment activity ===
  const markThemeAdjustment = useCallback(() => {
    setIsAdjustingTheme(true);
    // Only force panels open on desktop. On mobile we leave them closed.
    if (!isMobile) {
      setLeftPanelOpen(true);
      setRightPanelOpen(true);
    }
    
    // Clear existing timeout
    if (themeAdjustmentTimeoutRef.current) {
      clearTimeout(themeAdjustmentTimeoutRef.current);
    }
    
    // Set new timeout to stop tracking after 2 seconds of inactivity
    themeAdjustmentTimeoutRef.current = setTimeout(() => {
      setIsAdjustingTheme(false);
    }, 2000);
  }, [isMobile]);

  // --- SIDE EFFECTS ---
  // useEffects are called after the main state hooks.
  useEffect(() => {
    // This effect correctly handles redirection after checking auth state.
    if (isLoaded && !userId) {
      redirect("/sign-in");
    }
  }, [isLoaded, userId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isLoaded && userId) {
      fetchModels();
      fetchActiveKeys();
      fetchApiKeys();
      fetchMessageCount();
      fetchChats();
      loadSavedTheme();
    }
  }, [isLoaded, userId]);

  // Clean up the polling interval if the component unmounts before maxAttempts
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (themeAdjustmentTimeoutRef.current) {
        clearTimeout(themeAdjustmentTimeoutRef.current);
      }
    };
  }, []);

  // Keep the last opened chat in localStorage so a tab refresh stays put.
  useEffect(() => {
    if (currentChatId) {
      try {
        localStorage.setItem('xpochat:lastChatId', currentChatId);
      } catch (_) {
        /* ignore quota / SSR */
      }
    }
  }, [currentChatId]);

  // Ensure there is always at least a placeholder meta entry for the
  // currently selected chat so that it appears in the history list even if
  // it hasn't been persisted to the backend yet (e.g., brand-new chat).
  useEffect(() => {
    setChats(prev => {
      if (
        currentChatId &&
        !prev.some((c) => c.id === currentChatId)
      ) {
        return [
          ...prev,
          { id: currentChatId, title: 'New Chat', created: Date.now() },
        ].sort((a, b) => b.created - a.created);
      }
      return prev;
    });
  }, [currentChatId]);

  // === NEW: Persist container opacity changes & update CSS ===
  useEffect(() => {
    // Map slider (0-100) to actual opacity (0.9 → 0.1)
    const actualOpacity = 0.9 - (containerOpacity * 0.8) / 100;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--container-opacity', actualOpacity.toString());
    }

    // Mark that user is adjusting theme settings
    markThemeAdjustment();

    // Cache theme data in localStorage immediately
    if (userId) {
      try {
        localStorage.setItem(`xpochat:theme:${userId}`, JSON.stringify({
          color: selectedColor, gradientType, containerOpacity, fontSize, chatFontSize
        }));
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    // Debounce network persistence to avoid spamming while sliding
    if (opacityUpdateRef.current) clearTimeout(opacityUpdateRef.current);
    opacityUpdateRef.current = setTimeout(() => {
      if (!userId) return;
      getToken().then(token =>
        fetchWithAuth(getToken, '/api/user/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            color: selectedColor,
            gradientType,
            containerOpacity,
            fontSize,
            chatFontSize,
          }),
        }).catch(console.error)
      );
    }, 300);

    // Cleanup debounce timer on unmount/change
    return () => {
      if (opacityUpdateRef.current) clearTimeout(opacityUpdateRef.current);
    };
  }, [containerOpacity, selectedColor, gradientType, fontSize, chatFontSize, getToken, userId, markThemeAdjustment]);

  // === NEW: Persist font size changes & update CSS ===
  useEffect(() => {
    // Map slider (50-150) to rem size (0.75 → 1.25)
    const actualFontSize = 0.75 + (fontSize - 50) * 0.5 / 100;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--container-font-size', `${actualFontSize}rem`);
    }

    // Mark that user is adjusting theme settings
    markThemeAdjustment();

    // Cache theme data in localStorage immediately
    if (userId) {
      try {
        localStorage.setItem(`xpochat:theme:${userId}`, JSON.stringify({
          color: selectedColor, gradientType, containerOpacity, fontSize, chatFontSize
        }));
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    // Debounce network persistence
    if (fontSizeUpdateRef.current) clearTimeout(fontSizeUpdateRef.current);
    fontSizeUpdateRef.current = setTimeout(() => {
      if (!userId) return;
      getToken().then(token =>
        fetchWithAuth(getToken, '/api/user/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            color: selectedColor,
            gradientType,
            containerOpacity,
            fontSize,
            chatFontSize,
          }),
        }).catch(console.error)
      );
    }, 300);

    // Cleanup
    return () => {
      if (fontSizeUpdateRef.current) clearTimeout(fontSizeUpdateRef.current);
    };
  }, [fontSize, selectedColor, gradientType, containerOpacity, chatFontSize, getToken, userId, markThemeAdjustment]);

  // === CHAT FONT SIZE EFFECT (no persistence yet) ===
  useEffect(() => {
    const actual = 0.75 + (chatFontSize - 50) * 0.5 / 100;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--chat-font-size', `${actual}rem`);
    }

    // Mark user adjusting to keep panels open
    markThemeAdjustment();

    // Cache theme data in localStorage immediately
    if (userId) {
      try {
        localStorage.setItem(`xpochat:theme:${userId}`, JSON.stringify({
          color: selectedColor, gradientType, containerOpacity, fontSize, chatFontSize
        }));
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    // Debounce optional future persistence
    if (chatFontSizeUpdateRef.current) clearTimeout(chatFontSizeUpdateRef.current);
    chatFontSizeUpdateRef.current = setTimeout(() => {
      if (!userId) return;
      getToken().then(token =>
        fetchWithAuth(getToken, '/api/user/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            color: selectedColor,
            gradientType,
            containerOpacity,
            fontSize,
            chatFontSize,
          }),
        }).catch(console.error)
      );
    }, 300);

    return () => {
      if (chatFontSizeUpdateRef.current) clearTimeout(chatFontSizeUpdateRef.current);
    };
  }, [chatFontSize, selectedColor, gradientType, containerOpacity, fontSize, getToken, userId, markThemeAdjustment]);

  // === Helper: generate a readable title from message ===
  const generateTitle = (text: string) => {
    if (!text) return 'New Chat';

    const cleaned = text
      .replace(/^#+\s*/gm, '')        // Strip markdown headings
      .replace(/^[>*+-]\s+/gm, '')     // Strip list markers
      .replace(/[`*_~]/g, '')           // Strip stray markdown symbols
      .replace(/\n+/g, ' ')            // Collapse newlines
      .trim()
      .replace(/\s+/g, ' ');           // Collapse multiple spaces

    const filler = new Set([
      'okay', 'sure', 'alright', 'certainly', 'gladly', 'of', 'course',
      'here', "here's", 'absolutely', 'indeed'
    ]);
    const words = cleaned.split(' ');
    let start = 0;
    while (start < words.length && filler.has(words[start].toLowerCase())) {
      start++;
    }

    const candidate = words.slice(start, start + 10).join(' ');
    const trimmed = candidate.length > 60 ? candidate.slice(0, 57) + '…' : candidate;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  // Send message function
  interface AttachmentMeta { id: string; name: string; type: string; url: string; base64?: string; }
  const handleSendMessage = (messageData: string | { text: string; attachments: AttachmentMeta[] }) => {
    if (!isConnected) return;
    
    let content: string;
    let attachments: AttachmentMeta[] = [];
    
    if (typeof messageData === 'string') {
      content = messageData.trim();
    } else {
      content = messageData.text;
      attachments = messageData.attachments || [];
    }
    
    if (!content && attachments.length === 0) return;
    
    // Do NOT append attachments as markdown – they will be rendered from the attachments list.
    const fullMessage = content;
    
    const newChat = chats.find((c) => c.id === currentChatId);
    if (!newChat || newChat.title === 'New Chat') {
      const title = generateTitle(content);
      setChats((prev) => prev.map((c) => (c.id === currentChatId ? { ...c, title } : c)));
    }
    
    sendMessage(fullMessage, selectedModel, messages, attachments);
    setInputText('');
  };

  // Background generation with solid color support
  const getBackground = (color: string, gradType: string) => {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    
    const darkColor = `rgb(${Math.floor(r * 0.4)}, ${Math.floor(g * 0.4)}, ${Math.floor(b * 0.4)})`;
    
    switch (gradType) {
      case 'solid':
        return color;
      case 'linear-diagonal':
        return `linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 30%, ${darkColor} 60%, ${color} 100%)`;
      case 'linear-vertical':
        return `linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 30%, ${darkColor} 60%, ${color} 100%)`;
      case 'linear-horizontal':
        return `linear-gradient(90deg, #0a0a0a 0%, #1a1a1a 30%, ${darkColor} 60%, ${color} 100%)`;
      case 'radial-center':
        return `radial-gradient(circle, #0a0a0a 0%, #1a1a1a 30%, ${darkColor} 60%, ${color} 100%)`;
      case 'radial-corner':
        return `radial-gradient(circle at top right, #0a0a0a 0%, #1a1a1a 30%, ${darkColor} 60%, ${color} 100%)`;
      case 'conic':
        return `conic-gradient(from 45deg, #0a0a0a 0%, #1a1a1a 25%, ${darkColor} 50%, ${color} 75%, #0a0a0a 100%)`;
      default:
        return `linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 30%, ${darkColor} 60%, ${color} 100%)`;
    }
  };

  function changeTheme(color: string, gradType = gradientType) {
    const background = getBackground(color, gradType);
    
    // Mark that user is adjusting theme settings
    markThemeAdjustment();
    
    const style = document.createElement('style');
    style.innerHTML = `
      body { background: ${background} !important; background-attachment: fixed; }
      * { color: white !important; text-shadow: none !important; -webkit-font-smoothing: antialiased !important; }
    `;
    document.getElementById('dynamic-theme')?.remove();
    style.id = 'dynamic-theme';
    document.head.appendChild(style);
    setSelectedColor(color);
    
    // Make the selected color available as a global CSS variable
    document.documentElement.style.setProperty('--teal-primary', color);
    // Also expose the RGB components for easy rgba(...) usage in styles
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    document.documentElement.style.setProperty('--teal-primary-rgb', `${r}, ${g}, ${b}`);

    // Cache theme data in localStorage for immediate loading on next visit
    if (userId) {
      try {
        localStorage.setItem(`xpochat:theme:${userId}`, JSON.stringify({
          color, gradientType: gradType, containerOpacity, fontSize, chatFontSize
        }));
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    // Save theme to backend
    if (userId) {
      getToken().then(token => 
        fetchWithAuth(getToken, '/api/user/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ color, gradientType: gradType, containerOpacity, fontSize, chatFontSize })
        }).then(response => {
          if (!response) return;
          // Optionally handle response
        }).catch(console.error)
      );
    }
  }

  // Load chat history when the selected chat changes (or on first mount).
  // This now runs independently of the WebSocket connection so that we always
  // have the persisted history *before* any streaming resumes. If the AI is
  // mid-stream the server will subsequently emit a `stream-progress` event
  // which appends to the assistant message rather than being overwritten by
  // a late history fetch.
  // Load initial chat history only on first mount
  useEffect(() => {
    const loadInitialChatHistory = async () => {
      if (!currentChatId || !userId || isLoadingChat || messages.length > 0) return;
      
      try {
        const token = await getToken();
        const response = await fetchWithAuth(getToken, `/api/chats/${currentChatId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response && response.ok) {
          const data = await response.json();
          const parsedMsgs = JSON.parse(data.chat.messages || '[]').map((m: any, idx: number) => ({
            id: `${currentChatId}-${idx}`,
            role: m.role,
            ...(() => {
              if (m.reasoning) {
                return { content: m.content, reasoning: m.reasoning };
              }
              if (typeof m.content === 'string' && m.content.includes('__REASONING__')) {
                const segments = m.content.split('__REASONING__');
                const answer = segments.shift() || '';
                const reasoningCollected = segments.join('');
                return { content: answer, reasoning: reasoningCollected };
              }
              return { content: m.content };
            })(),
            ...(m.audio ? { audio: m.audio } : {}),
            ...(m.attachments ? { attachments: m.attachments } : {}),
            ...(m.model ? { model: m.model } : {}),
            streaming: false,
            reasoningOpen: false,
            timestamp: Date.now()
          }));

          setMessages(parsedMsgs);
        }
      } catch (err) {
        console.error('Error loading initial chat history:', err);
      }
    };
    
    loadInitialChatHistory();
  }, [currentChatId, userId, getToken, setMessages, isLoadingChat, messages.length]);

  // --- Chat history actions passed to ChatHistoryPanel ---
  const handleNewChat = async () => {
    const newId = `chat_${Date.now()}`;

    let backendReady = false;
    try {
      const token = await getToken();
      const res = await fetchWithAuth(getToken, '/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatId: newId, model: selectedModel }),
      });
      backendReady = !!res && res.ok;
    } catch (err) {
      console.warn('New chat init failed (will retry on first message):', err);
    }

    // Proceed regardless (fallback: backend will create on first message via WS)
    setCurrentChatId(newId);
    setChats((prev) =>
      [...prev, { id: newId, title: 'New Chat', created: Date.now() }].sort((a, b) => b.created - a.created)
    );
    if (!backendReady) {
      // Avoid 404 loop: skip history fetch until backend confirms creation.
      // We mark messages reset after a tiny delay giving WS a chance to join.
      setTimeout(() => resetMessages(), 0);
    } else {
      resetMessages();
    }
  };

  const handleRenameChat = async (chatId: string, newTitle: string) => {
    if (!newTitle) return;
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, `/api/chats/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle })
      });
      if (!response) return;
      fetchChats();
    } catch (err) {
      console.error('Failed to rename chat', err);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const token = await getToken();
      const response = await fetchWithAuth(getToken, `/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response) return;
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (currentChatId === chatId) {
        const nextChat = chats.find((c) => c.id !== chatId);
        if (nextChat) {
          handleSelectChat(nextChat.id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete chat', err);
    }
  };

  // Handle chat branching - create a new chat from a specific message point
  const handleBranchChat = async (fromMessageIndex: number) => {
    try {
      const token = await getToken();
      const newChatId = `chat_${Date.now()}`;
      
      // Get messages up to and including the branching point
      const branchMessages = messages.slice(0, fromMessageIndex + 1);
      
      // Create the new chat with branched messages
      const response = await fetchWithAuth(getToken, '/api/chats/branch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          newChatId,
          originalChatId: currentChatId,
          messages: branchMessages,
          branchPoint: fromMessageIndex,
          model: selectedModel
        })
      });

      if (response) {
        // Add the new chat to the chat list
        const branchTitle = `Branch from ${chats.find(c => c.id === currentChatId)?.title || 'Chat'}`;
        setChats((prev) => [{
          id: newChatId,
          title: branchTitle,
          created: Date.now()
        }, ...prev]);
        
        // Switch to the new branched chat
        setCurrentChatId(newChatId);
        resetMessages();
        
        // Messages will be loaded by the useEffect when currentChatId changes
      } else {
        console.error('Failed to create branch');
      }
    } catch (err) {
      console.error('Error branching chat:', err);
    }
  };

  const handleRetryMessage = async (messageIndex: number) => {
    try {
      // Validate messageIndex is within bounds
      if (messageIndex < 0 || messageIndex >= messages.length) {
        console.error('Message index out of bounds:', messageIndex, 'Array length:', messages.length);
        return;
      }

      // Get the user message to retry
      const messageToRetry = messages[messageIndex];
      
      if (messageToRetry.role !== 'user') {
        console.error('Can only retry user messages');
        return;
      }

      // Remove all messages after the user message we're retrying
      // This keeps the conversation up to and including the user message
      const trimmedMessages = messages.slice(0, messageIndex + 1);
      setMessages(trimmedMessages);

      // Resend the user message without adding it to the UI again
      // The sendMessage function will add a new user message, so we pass the history without the current message
      const historyForRetry = messages.slice(0, messageIndex);
      
      if (typeof messageToRetry.content === 'string') {
        sendMessage(
          messageToRetry.content, 
          selectedModel, 
          historyForRetry, 
          messageToRetry.attachments || []
        );
      }
    } catch (err) {
      console.error('Error retrying message:', err);
    }
  };

  const handleEditMessage = async (messageIndex: number, newContent: string) => {
    try {
      // Validate messageIndex is within bounds
      if (!Number.isInteger(messageIndex) || messageIndex < 0 || messageIndex >= messages.length) {
        console.error('Invalid message index:', messageIndex, 'Array length:', messages.length);
        return;
      }

      // Get the user message to edit
      const messageToEdit = messages[messageIndex];
      
      if (messageToEdit.role !== 'user') {
        console.error('Can only edit user messages');
        return;
      }

      // Update the message content in place
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...messageToEdit,
        content: newContent
      };

      // Remove all messages after the edited message
      const trimmedMessages = updatedMessages.slice(0, messageIndex + 1);
      setMessages(trimmedMessages);

      // Resend with the edited content
      const historyForEdit = updatedMessages.slice(0, messageIndex);
      
      sendMessage(
        newContent, 
        selectedModel, 
        historyForEdit, 
        messageToEdit.attachments || []
      );
    } catch (err) {
      console.error('Error editing message:', err);
    }
  };

  // Keep `isMobile` state in sync with viewport size (and close panels on shrink)
  useEffect(() => {
    const checkViewport = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);

      if (mobile) {
        setLeftPanelOpen(false);
        setRightPanelOpen(false);
      }
    };

    // Run once on mount
    checkViewport();

    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // --- CONDITIONAL RENDER ---
  // This now happens *after* all hooks have been called.
  if (!isLoaded || !userId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-teal-300 text-lg font-light">Loading your chat...</p>
        </div>
      </div>
    );
  }

  // --- MAIN RENDER ---
  // Mobile layout for screens < 1024px
  if (isMobile) {
    return (
      <MobileChatLayout
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
        setLeftPanelOpen={setLeftPanelOpen}
        setRightPanelOpen={setRightPanelOpen}
        
        messages={messages}
        isTyping={isTyping}
        isProcessing={isProcessing}
        isLoadingChat={isLoadingChat}
        currentChatId={currentChatId}
        setMessages={setMessages}
        
        inputText={inputText}
        setInputText={setInputText}
        handleSendMessage={handleSendMessage}
        isConnected={isConnected}
        isRecording={isRecording}
        setIsRecording={setIsRecording}
        hasJoined={hasJoined}
        
        models={models}
        activeApiKeys={activeApiKeys}
        selectedModel={selectedModel}
        setSelectedModel={handleSelectModel}
        messageCount={messageCount}
        messageLimit={messageLimit}
        
        chats={chats}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onBranchChat={handleBranchChat}
        onRetryMessage={handleRetryMessage}
        onEditMessage={handleEditMessage}
        
        configuringProvider={configuringProvider}
        setConfiguringProvider={setConfiguringProvider}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        getToken={getToken}
        fetchActiveKeys={fetchActiveKeys}
        fetchModels={fetchModels}
        selectedColor={selectedColor}
        setSelectedColor={setSelectedColor}
        gradientType={gradientType}
        setGradientType={setGradientType}
        containerOpacity={containerOpacity}
        setContainerOpacity={setContainerOpacity}
        fontSize={fontSize}
        setFontSize={setFontSize}
        chatFontSize={chatFontSize}
        setChatFontSize={setChatFontSize}
        changeTheme={changeTheme}
        markThemeAdjustment={markThemeAdjustment}
        
        starterSuggestions={STARTER_SUGGESTIONS}
      />
    );
  }

  // Desktop layout for screens >= 1024px
  return (
    <div className="h-screen">
      {/* Header */}
      <header className="h-20 flex justify-between items-center px-6 z-40 absolute top-0 left-0 right-0">
        <h1 className="text-5xl font-light text-white tracking-wider brand-name -mt-4">
          xpochat
        </h1>
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 [&>button]:w-full [&>button]:h-full">
            <UserButton 
              afterSignOutUrl="/" 
              appearance={{
                variables: {
                  colorPrimary: '#1a4a4a',
                  colorBackground: 'rgba(26, 26, 26, 0.8)',
                  colorText: '#ededed',
                  colorTextSecondary: '#a1a1aa',
                  borderRadius: '0.5rem'
                },
                elements: {
                  userButtonTrigger: {
                    border: '1px solid rgba(26, 74, 74, 0.3)',
                    background: 'rgba(26, 26, 26, 0.8)',
                    backdropFilter: 'blur(10px)'
                  },
                  userButtonPopoverCard: {
                    background: 'rgba(26, 26, 26, 0.9)',
                    border: '1px solid rgba(26, 74, 74, 0.3)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                  }
                }
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Chat Container (positioned correctly) */}
      <main className="h-screen w-screen flex justify-center items-end px-4 pb-4">
        <div
          style={{
            maxWidth: CHAT_MAX_WIDTH,
            height: CHAT_HEIGHT,
            backgroundColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), var(--container-opacity, 0.26))`,
          }}
          className="w-full backdrop-blur-sm flex flex-col chat-font rounded-lg"
        >
          {/* Messages Area */}
          <div
            className="relative flex-1 min-h-0 px-6 pt-6 pb-4 overflow-y-auto scrollbar-hide"
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 40px, black calc(100% - 40px), transparent 100%)',
              maskImage: 'linear-gradient(to bottom, transparent 0px, black 40px, black calc(100% - 40px), transparent 100%)',
            }}
          >
            <MessageList 
              messages={messages} 
              isTyping={isTyping} 
              isProcessing={isProcessing} 
              setMessages={setMessages} 
              currentChatId={currentChatId}
              onBranchChat={handleBranchChat}
              onRetryMessage={handleRetryMessage}
              onEditMessage={handleEditMessage}
              getToken={getToken}
            />

            {/* Welcome overlay - only show for truly empty chats, not during loading */}
            {messages.length === 0 && !isLoadingChat && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-8">
                <div className="pointer-events-auto max-w-2xl w-full">
                  {/* Hero Section */}
                  <div className="mb-12 animate-fade-in-up">
                    <h2 className="text-5xl sm:text-6xl font-light bg-gradient-to-r from-teal-200 via-teal-300 to-teal-400 bg-clip-text text-transparent mb-8 tracking-tight">
                      Welcome to Xpochat
                    </h2>
                    <p className="text-xl text-gray-300 font-light mb-6">
                      Lightning-fast AI at your fingertips
                    </p>
                    <p className="text-base text-gray-400 font-light max-w-lg mx-auto leading-relaxed">
                      Ask anything to get started, or try one of these conversation starters
                    </p>
                  </div>

                  {/* Starter Suggestions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 animate-fade-in-up delay-200">
                    {STARTER_SUGGESTIONS.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSendMessage(suggestion)}
                        className="pointer-events-auto group relative overflow-hidden bg-gradient-to-r from-black/20 to-black/10 hover:from-teal-900/30 hover:to-teal-800/20 border border-teal-700/30 hover:border-teal-500/50 rounded-2xl p-4 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-teal-500/10"
                        style={{ animationDelay: `${(index + 3) * 100}ms` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative z-10">
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-teal-400 rounded-full mt-2 group-hover:bg-teal-300 transition-colors"></div>
                            <span className="text-gray-200 group-hover:text-white font-medium text-sm leading-relaxed transition-colors">
                              {suggestion}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Quick Tips */}
                  <div className="animate-fade-in-up delay-400">
                    <div className="flex items-center justify-center gap-6 text-xs text-gray-500 mb-4">
                      <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
                        Ultra-fast streaming
                      </span>
                      <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
                        Multimodal support
                      </span>
                      <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
                        Smart conversations
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-light">
                      Tip: Use the panels on the left and right to manage your chats and settings
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading overlay during chat switching */}
            {isLoadingChat && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/10 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-teal-300 text-sm font-light">Switching chat...</p>
                </div>
              </div>
            )}
          </div>
          {/* Input Area */}
          <ChatInputArea
            inputText={inputText}
            setInputText={setInputText}
            handleSendMessage={handleSendMessage}
            isConnected={isConnected}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            models={models}
            activeApiKeys={activeApiKeys}
            selectedModel={selectedModel}
            setSelectedModel={handleSelectModel}
            messageCount={messageCount}
            messageLimit={messageLimit}
            isProcessing={isProcessing}
            hasJoined={hasJoined}
            getToken={getToken}
          />
        </div>
      </main>

      {/* Left Sliding Panel */}
      <ChatHistoryPanel
        leftPanelOpen={leftPanelOpen}
        width={LEFT_PANEL_WIDTH}
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onClose={() => !isAdjustingTheme && setLeftPanelOpen(false)}
      />
      
      {/* Right Sliding Panel */}
      <SettingsPanel
        rightPanelOpen={rightPanelOpen}
        width={RIGHT_PANEL_WIDTH}
        models={models}
        configuringProvider={configuringProvider}
        setConfiguringProvider={setConfiguringProvider}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        getToken={getToken}
        fetchActiveKeys={fetchActiveKeys}
        fetchModels={fetchModels}
        selectedColor={selectedColor}
        setSelectedColor={setSelectedColor}
        gradientType={gradientType}
        setGradientType={setGradientType}
        containerOpacity={containerOpacity}
        setContainerOpacity={setContainerOpacity}
        fontSize={fontSize}
        setFontSize={setFontSize}
        chatFontSize={chatFontSize}
        setChatFontSize={setChatFontSize}
        changeTheme={changeTheme}
        markThemeAdjustment={markThemeAdjustment}
        onClose={() => !isAdjustingTheme && setRightPanelOpen(false)}
      />

      {/* --- Hover Zones for Auto-Opening Panels --- */}
      {/* Render only when the corresponding panel is closed to avoid accidental re-open loops */}
      {!leftPanelOpen && !isAdjustingTheme && (
        <div
          className="fixed left-0 top-0 bottom-0 z-10"
          style={{ width: HOVER_ZONE_WIDTH }}
          onMouseEnter={() => setLeftPanelOpen(true)}
        />
      )}

      {!rightPanelOpen && !isAdjustingTheme && (
        <div
          className="fixed right-0 top-0 bottom-0 z-10"
          style={{ width: HOVER_ZONE_WIDTH }}
          onMouseEnter={() => setRightPanelOpen(true)}
        />
      )}

      {/* Manual click toggles remain for accessibility */}
      <div className={`fixed top-1/2 -translate-y-1/2 z-40 transition-all duration-300 ${
        leftPanelOpen ? 'left-2' : 'left-4'
      }`}>
        <button 
          onClick={() => setLeftPanelOpen((prev) => !prev)}
          className="w-5 h-10 bg-black/20 backdrop-blur-sm border border-teal-800/20 rounded-r-lg shadow-lg hover:bg-black/30 transition-all flex items-center justify-center"
        >
          <div className="w-0.5 h-3 bg-white/50 rounded-full"></div>
        </button>
      </div>
      
      <div className={`fixed top-1/2 -translate-y-1/2 z-40 transition-all duration-300 ${
        rightPanelOpen ? 'right-2' : 'right-4'
      }`}>
        <button 
          onClick={() => setRightPanelOpen((prev) => !prev)}
          className="w-5 h-10 bg-black/20 backdrop-blur-sm border border-teal-800/20 rounded-l-lg shadow-lg hover:bg-black/30 transition-all flex items-center justify-center"
        >
          <div className="w-0.5 h-3 bg-white/50 rounded-full"></div>
        </button>
      </div>

    </div>
  );
} 