'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // GitHub Flavored Markdown (tables, strikethrough, task lists)
import MessageActions from './MessageActions';
import { highlightCode } from '../../utils/syntaxHighlighter';

// URL sanitization function to ensure safe URLs
function sanitizeUrl(url: string | undefined): string | null {
  if (!url) return null;
  
  try {
    const parsed = new URL(url);
    // Only allow safe protocols
    const allowedProtocols = ['http:', 'https:', 'data:', 'blob:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return null;
    }
    
    // For data URLs, ensure they're for allowed MIME types
    if (parsed.protocol === 'data:') {
      const allowedDataTypes = [
        'image/',
        'audio/',
        'video/',
        'application/pdf',
        'text/plain'
      ];
      const mimeType = url.split(':')[1]?.split(';')[0];
      if (!mimeType || !allowedDataTypes.some(type => mimeType.startsWith(type))) {
        return null;
      }
    }
    
    return parsed.toString();
  } catch {
    // Invalid URL
    return null;
  }
}

// Safe window.open function with security parameters
function safeWindowOpen(url: string | null): void {
  if (!url) return;
  
  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  // Additional security: clear opener reference
  if (newWindow) {
    newWindow.opener = null;
  }
}

// Memoized code highlighter component for performance
const HighlightedCode = React.memo<{ code: string; language: string }>(({ code, language }) => {
  const highlightedHtml = useMemo(() => highlightCode(code, language), [code, language]);
  return <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />;
});
HighlightedCode.displayName = 'HighlightedCode';

// Optimized code extraction function
function extractCodeContent(children: React.ReactNode): { code: string; language: string } {
  const firstChild: any = Array.isArray(children) ? children[0] : children;
  
  if (firstChild && typeof firstChild === 'object' && 'props' in firstChild) {
    const inner = firstChild.props.children;
    const code = typeof inner === 'string' ? inner : Array.isArray(inner) ? inner.join('') : '';
    
    let language = '';
    if (typeof firstChild.props.className === 'string') {
      const match = firstChild.props.className.match(/language-(\w+)/);
      if (match) language = match[1];
    }
    
    return { code: code || String(children), language };
  }
  
  return { 
    code: typeof firstChild === 'string' ? firstChild : String(children), 
    language: '' 
  };
}

// Local message type identical to the one used in ChatPage
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  reasoningOpen?: boolean;
  reasoningExpanded?: boolean;
  audio?: string; // assistant TTS audio data URL
  attachments?: Array<{ id: string; name: string; type: string; url?: string; base64?: string }>;
  model?: string;
  streaming?: boolean;
  timestamp: number;
}

interface MessageListProps {
  messages: ChatMessage[];
  isTyping: boolean;
  isProcessing: boolean;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  currentChatId?: string;
  onBranchChat?: (fromMessageIndex: number) => void;
  getToken?: () => Promise<string | null>;
  onRetryMessage?: (messageIndex: number) => void;
  onEditMessage?: (messageIndex: number, newContent: string) => void;
}

/**
 * Renders the list of chat messages (including markdown parsing for assistant replies)
 * and the typing indicator.  Also auto-scrolls to the latest message just like the
 * original implementation in page.tsx.
 */
const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  isTyping, 
  isProcessing, 
  setMessages, 
  currentChatId,
  onBranchChat,
  getToken,
  onRetryMessage,
  onEditMessage
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef(false);
  const thinkingScrollRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Keep the auto-scroll behaviour that existed in ChatPage
  // Only scroll when messages are added or content changes, not when reasoningOpen toggles
  const prevMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    const shouldScroll = 
      messages.length !== prevMessagesRef.current.length || // New message added
      messages.some((msg, i) => {
        const prevMsg = prevMessagesRef.current[i];
        return prevMsg && (msg.content !== prevMsg.content || msg.reasoning !== prevMsg.reasoning);
      }); // Content or reasoning content changed (streaming)
    
    if (shouldScroll && !scrollRafRef.current) {
      scrollRafRef.current = true;
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        scrollRafRef.current = false;
      });
    }
    
    prevMessagesRef.current = messages;
  }, [messages]);

  // Auto-scroll thinking containers when reasoning content changes (streaming)
  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.reasoning && msg.reasoningOpen && !msg.reasoningExpanded) {
        const thinkingContainer = thinkingScrollRefs.current.get(msg.id);
        if (thinkingContainer) {
          // Only auto-scroll if user hasn't manually scrolled up
          const isAtBottom = thinkingContainer.scrollTop + thinkingContainer.clientHeight >= thinkingContainer.scrollHeight - 5;
          if (isAtBottom) {
            requestAnimationFrame(() => {
              thinkingContainer.scrollTop = thinkingContainer.scrollHeight;
            });
          }
        }
      }
    });
  }, [messages.map(msg => msg.reasoning).join('')]);

  // Cleanup refs when component unmounts
  useEffect(() => {
    return () => {
      thinkingScrollRefs.current.clear();
    };
  }, []);

  return (
    <div className="space-y-4">
      {messages.map((msg, index) => (
        <div key={msg.id}>
          {/* Subtle divider line between messages (but not before first message) */}
          {index > 0 && (
            <div className="flex justify-center mb-6">
              <div className="w-1/2 h-px bg-gradient-to-r from-transparent via-teal-800/20 to-transparent"></div>
            </div>
          )}

          <div className={`w-full ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            {msg.role === 'assistant' ? (
              <div className={`prose prose-invert prose-sm !max-w-none w-full text-lg text-gray-100`}>
                {/* Reasoning Section - Only show if reasoning exists */}
                {msg.reasoning && (
                  <div 
                    className={`mb-4 rounded-lg bg-black/20 backdrop-blur-sm transition-all duration-300 relative ${
                      msg.reasoningOpen 
                        ? 'reasoning-border-pulse' 
                        : 'border border-teal-800/20'
                    }`}
                  >
                    <details
                      className="group cursor-pointer"
                      open={msg.reasoningOpen}
                      onToggle={e => {
                        const details = e.currentTarget;
                        if (!details) return;
                        
                        setMessages(prevMsgs =>
                          prevMsgs.map(m =>
                            m.id === msg.id ? { ...m, reasoningOpen: details.open } : m
                          )
                        );
                      }}
                    >
                      <summary 
                        className="cursor-pointer p-3 flex items-center justify-between text-xs text-teal-300 hover:text-teal-200 transition-all duration-200 hover:bg-teal-900/10 list-none"
                        onClick={(e) => {
                          // Make the entire summary area clickable
                          e.preventDefault();
                          const details = e.currentTarget.closest('details') as HTMLDetailsElement;
                          if (details) {
                            details.open = !details.open;
                            setMessages(prevMsgs =>
                              prevMsgs.map(m =>
                                m.id === msg.id ? { ...m, reasoningOpen: details.open } : m
                              )
                            );
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                            msg.streaming ? 'bg-teal-400 animate-pulse shadow-sm shadow-teal-400/50' : 'bg-teal-600'
                          }`}></div>
                          <span className="font-normal tracking-wide text-[0.68rem]">Thinking Process</span>
                          {msg.streaming && (
                            <div className="flex gap-1">
                              <div className="w-0.5 h-0.5 bg-teal-400/60 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                              <div className="w-0.5 h-0.5 bg-teal-400/60 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                              <div className="w-0.5 h-0.5 bg-teal-400/60 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMessages(prevMsgs =>
                                prevMsgs.map(m =>
                                  m.id === msg.id ? { ...m, reasoningExpanded: !m.reasoningExpanded } : m
                                )
                              );
                            }}
                            className="px-1.5 py-0.5 text-[0.6rem] bg-teal-800/20 hover:bg-teal-700/40 rounded border border-teal-700/30 hover:border-teal-600/50 transition-all duration-200 hover:scale-105"
                            title={msg.reasoningExpanded ? "Collapse" : "Expand"}
                          >
                            <span className="font-mono">{msg.reasoningExpanded ? "⤋" : "⤢"}</span>
                          </button>
                          <svg
                            className="w-3 h-3 transition-transform duration-300 group-open:rotate-180"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </summary>
                      <div className="border-t border-teal-800/10">
                        {/* Compact scrollable view by default */}
                        <div 
                          ref={(el) => {
                            if (el) {
                              thinkingScrollRefs.current.set(msg.id, el);
                            } else {
                              thinkingScrollRefs.current.delete(msg.id);
                            }
                          }}
                          className={`thinking-scrollbar ${
                            msg.reasoningExpanded 
                              ? 'max-h-none thinking-expand' 
                              : 'max-h-48 overflow-y-auto thinking-collapse'
                          }`}
                        >
                          <div className="px-3 pb-3 pt-2">
                            <div className="prose prose-invert !max-w-none w-full" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code: ({ className, children, ...props }) => (
                                    <code
                                      className="bg-gradient-to-r from-black/60 to-black/40 text-teal-300 px-1 py-0.5 rounded text-[0.6rem] border border-teal-800/30 font-mono shadow-sm"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  ),
                                  pre: ({ children }) => {
                                    const { code, language } = extractCodeContent(children);

                                    return (
                                      <pre className="bg-gradient-to-br from-black/60 to-black/40 border border-teal-800/30 rounded-lg p-2 overflow-x-auto code-scrollbar text-[0.6rem] my-2 shadow-sm">
                                        <HighlightedCode code={code} language={language} />
                                      </pre>
                                    );
                                  },
                                  a: ({ href, children }) => (
                                    <a
                                      href={href as string}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-teal-300 hover:text-teal-200 underline decoration-teal-400/40 hover:decoration-teal-200 transition-colors"
                                    >
                                      {children}
                                    </a>
                                  ),
                                  p: ({ children }) => (
                                    <p className="text-gray-400 mb-1.5 text-[0.65rem] leading-relaxed tracking-normal font-light">{children}</p>
                                  ),
                                  h1: ({ children }) => (
                                    <h1 className="text-[0.7rem] text-gray-200 mb-1.5 mt-2 font-normal border-b border-teal-800/15 pb-1">
                                      <span className="text-teal-400 mr-1.5">▶</span>{children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 className="text-[0.65rem] text-gray-300 mb-1 mt-2 font-normal">
                                      <span className="text-teal-400 mr-1.5">▸</span>{children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 className="text-[0.6rem] text-gray-400 mb-1 mt-1.5 font-normal">
                                      <span className="text-teal-500 mr-1">•</span>{children}
                                    </h3>
                                  ),
                                  ul: ({ children }) => (
                                    <ul className="ml-3 space-y-0.5 text-gray-400 my-1.5 list-none">
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="ml-3 space-y-0.5 text-gray-400 my-1.5 list-none counter-reset-item">
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li className="text-gray-400 text-[0.6rem] relative pl-3 before:content-['→'] before:absolute before:left-0 before:text-teal-500/70 before:font-mono before:text-[0.55rem] font-light">
                                      {children}
                                    </li>
                                  ),
                                  blockquote: ({ children }) => (
                                    <blockquote className="border-l-2 border-teal-500/50 pl-3 italic text-gray-500 my-1.5 text-[0.6rem] bg-teal-900/5 py-1.5 rounded-r font-light">
                                      {children}
                                    </blockquote>
                                  ),
                                  strong: ({ children }) => (
                                    <span className="text-gray-200 font-normal">{children}</span>
                                  ),
                                  em: ({ children }) => <em className="italic text-teal-200/80 font-light">{children}</em>,
                                }}
                              >
                                {msg.reasoning as string}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                        {/* Enhanced fade gradient at bottom when collapsed */}
                        {!msg.reasoningExpanded && (
                          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/30 via-black/15 to-transparent pointer-events-none rounded-b-lg">
                            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-0.5 bg-teal-600/30 rounded-full"></div>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}

                {/* Main Response */}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Code blocks (inline)
                    code: ({ className, children, ...props }) => (
                      <code
                        className="bg-black/60 text-teal-300 px-2 py-1 rounded-md text-sm font-mono border border-teal-800/30 shadow-sm"
                        {...props}
                      >
                        {children}
                      </code>
                    ),
                    // Code blocks (fenced)
                    pre: ({ children }) => {
                      const { code, language } = extractCodeContent(children);

                      return (
                        <div className="relative group my-4">
                          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MessageActions content={code} isAssistant={false} />
                          </div>
                          <pre
                            className="bg-black/60 border border-teal-800/30 rounded-lg p-4 overflow-x-auto code-scrollbar text-sm font-mono shadow-sm"
                          >
                            <HighlightedCode code={code} language={language} />
                          </pre>
                        </div>
                      );
                    },
                    // Images
                    img: ({ src, alt }) => (
                      <img
                        src={src}
                        alt={alt || ''}
                        className="max-w-full h-auto rounded-lg border border-teal-800/30 my-3 shadow-sm"
                        style={{ maxHeight: '400px' }}
                      />
                    ),
                    // Headers with elegant styling
                    h1: ({ children }) => (
                      <h1 className="text-xl text-white mb-4 mt-6 font-semibold border-b border-teal-800/30 pb-2">
                        <span className="text-teal-400 mr-3 font-normal">▶</span>{children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg text-white mb-3 mt-5 font-medium">
                        <span className="text-teal-400 mr-2 font-normal">▸</span>{children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base text-gray-200 mb-3 mt-4 font-medium">
                        <span className="text-teal-500 mr-2">•</span>{children}
                      </h3>
                    ),
                    h4: ({ children }) => (
                      <h4 className="text-sm text-gray-300 mb-2 mt-3 font-medium">
                        <span className="text-teal-600 mr-1">‣</span>{children}
                      </h4>
                    ),
                    // Lists with custom styling
                    ul: ({ children }) => (
                      <ul className="ml-6 space-y-2 text-gray-100 my-4 list-none">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="ml-6 space-y-2 text-gray-100 my-4 list-none counter-reset-item">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-gray-100 text-base leading-relaxed relative pl-5 before:content-['→'] before:absolute before:left-0 before:text-teal-400 before:font-mono before:text-sm">
                        {children}
                      </li>
                    ),
                    // Links with refined styling
                    a: ({ href, children }) => (
                      <a
                        href={href as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-300 hover:text-teal-200 underline decoration-teal-400/60 hover:decoration-teal-200 transition-colors duration-200"
                      >
                        {children}
                      </a>
                    ),
                    // Blockquotes with elegant styling
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-teal-500/70 pl-6 italic text-gray-200 my-4 text-base leading-relaxed bg-teal-900/5 py-3 rounded-r-md">
                        {children}
                      </blockquote>
                    ),
                    // Paragraphs with refined typography
                    p: ({ children }) => (
                      <p className="text-gray-100 mb-4 text-base leading-relaxed tracking-wide">{children}</p>
                    ),
                    // Strong/Bold with proper contrast
                    strong: ({ children }) => (
                      <strong className="text-white font-semibold">{children}</strong>
                    ),
                    // Emphasis/Italic with teal accent
                    em: ({ children }) => <em className="italic text-teal-200">{children}</em>,
                    // Tables (if needed)
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4">
                        <table className="min-w-full border border-teal-800/30 rounded-lg overflow-hidden">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-teal-900/20">
                        {children}
                      </thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-4 py-2 text-left text-sm font-medium text-teal-200 border-b border-teal-800/30">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-2 text-sm text-gray-100 border-b border-teal-800/20">
                        {children}
                      </td>
                    ),
                    // Horizontal rules
                    hr: () => (
                      <hr className="my-6 border-0 h-px bg-gradient-to-r from-transparent via-teal-800/40 to-transparent" />
                    ),
                  }}
                >
                  {typeof msg.content === 'string' ? msg.content : String(msg.content || '')}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="inline-block w-full">
                <div className="prose prose-invert prose-sm !max-w-none w-full text-base text-gray-100">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Keep user formatting simpler but consistent
                      code: ({ children, ...props }) => (
                        <code
                          className="bg-black/40 text-teal-300 px-1.5 py-0.5 rounded text-sm font-mono border border-teal-800/20"
                          {...props}
                        >
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-black/40 border border-teal-800/20 rounded-lg p-3 overflow-x-auto text-sm font-mono my-3">
                          {children}
                        </pre>
                      ),
                      strong: ({ children }) => (
                        <strong className="text-white font-semibold">{children}</strong>
                      ),
                      em: ({ children }) => <em className="italic text-teal-200">{children}</em>,
                      a: ({ href, children }) => (
                        <a
                          href={href as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-300 hover:text-teal-200 underline transition-colors"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {typeof msg.content === 'string' ? msg.content : String(msg.content || '')}
                  </ReactMarkdown>
                </div>
                {/* Render user attachments below the text message, aligned to the right */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    {msg.attachments.map(att => {
                      const sanitizedUrl = sanitizeUrl(att.url || att.base64);
                      
                      return att.type.startsWith('audio/') ? (
                        <audio key={att.id} controls src={sanitizedUrl || undefined} className="max-w-full" />
                      ) : att.type.startsWith('image/') ? (
                        <img 
                          key={att.id} 
                          src={sanitizedUrl || undefined} 
                          alt={att.name} 
                          className="rounded-lg border border-teal-800/30 max-w-48 max-h-48 object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                          onClick={() => safeWindowOpen(sanitizedUrl)}
                        />
                      ) : (
                        sanitizedUrl ? (
                          <a key={att.id} href={sanitizedUrl} target="_blank" rel="noopener noreferrer" className="block text-teal-300 underline">
                            {att.name}
                          </a>
                        ) : (
                          <span key={att.id} className="block text-gray-500 line-through">
                            {att.name} (invalid URL)
                          </span>
                        )
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* Assistant audio playback */}
            {msg.role === 'assistant' && msg.audio && (
              <audio controls autoPlay src={sanitizeUrl(msg.audio) || undefined} className="mt-4 w-full max-w-md" />
            )}
            <div
              className={`flex items-center gap-2 text-xs opacity-50 mt-2 ${
                msg.role === 'user' ? 'justify-end text-right' : 'justify-start text-left'
              }`}
            >
              <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>

              {/* Show model/provider info for assistant messages after streaming finishes */}
              {msg.role === 'assistant' && !msg.streaming && msg.model && (
                <span className="text-teal-400">
                  {(() => {
                    const parts = msg.model.split('/');
                    if (parts.length === 1) return parts[0];
                    // Provider is first segment; model name is last
                    const provider = parts[0];
                    const modelName = parts.slice(1).join('/');
                    return `${modelName} (${provider})`;
                  })()}
                </span>
              )}

              {/* Action buttons only after streaming finished */}
              {(!msg.streaming || msg.role === 'user') && (
                <MessageActions
                  content={typeof msg.content === 'string' ? msg.content : String(msg.content || '')}
                  chatId={currentChatId}
                  messageIndex={index}
                  getToken={getToken}
                  onBranch={onBranchChat}
                  onRetry={onRetryMessage}
                  onEdit={onEditMessage}
                  isAssistant={msg.role === 'assistant'}
                  messages={messages}
                />
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Processing indicator - shows when AI is processing but hasn't started streaming */}
      {isProcessing && (
        <div>
          {/* Subtle divider before processing indicator */}
          <div className="flex justify-center mb-6">
            <div className="w-1/2 h-px bg-gradient-to-r from-transparent via-teal-800/20 to-transparent"></div>
          </div>

          <div className="w-full text-left">
            <div className="flex items-center gap-3">
              {/* Animated processing icon */}
              <div className="relative">
                <div className="w-6 h-6 border-2 border-teal-800/30 rounded-full">
                  <div className="absolute inset-0 border-2 border-transparent border-t-teal-400 rounded-full animate-spin"></div>
                </div>
              </div>
              {/* Processing text with subtle animation */}
              <div className="flex items-center gap-1">
                <span className="text-teal-300 text-sm font-medium">Processing</span>
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-teal-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
                  <div className="w-1 h-1 bg-teal-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1 h-1 bg-teal-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Typing indicator */}
      {isTyping && (
        <div>
          {/* Subtle divider before typing indicator */}
          <div className="flex justify-center mb-6">
            <div className="w-1/2 h-px bg-gradient-to-r from-transparent via-teal-800/20 to-transparent"></div>
          </div>

          <div className="w-full text-left">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" />
              <div
                className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"
                style={{ animationDelay: '0.2s' }}
              />
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList; 