'use client';

import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // GitHub Flavored Markdown (tables, strikethrough, task lists)
import MessageActions from './MessageActions';

// Local message type identical to the one used in ChatPage
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  reasoningOpen?: boolean;
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
  getToken
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef(false);

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
                    className={`mb-4 rounded-lg bg-black/20 backdrop-blur-sm transition-all duration-300 ${
                      msg.reasoningOpen 
                        ? 'reasoning-border-pulse' 
                        : 'border border-teal-800/20'
                    }`}
                  >
                    <details
                      className="group"
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
                      <summary className="cursor-pointer p-3 flex items-center justify-between text-sm text-teal-300 hover:text-teal-200 transition-colors">
                        <span className="font-medium">
                          Thinking Process
                        </span>
                        <svg
                          className="w-4 h-4 transition-transform group-open:rotate-180"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div className="px-3 pb-3 pt-1 border-t border-teal-800/10">
                        {/* Render reasoning with full Markdown support and larger, readable font */}
                        <div className="prose prose-invert text-sm sm:text-base leading-relaxed !max-w-none w-full">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code: ({ className, children, ...props }) => (
                                <code
                                  className="bg-black/50 text-teal-300 px-1.5 py-0.5 rounded text-[0.85rem] border border-teal-800/20"
                                  {...props}
                                >
                                  {children}
                                </code>
                              ),
                              pre: ({ children }) => (
                                <pre className="bg-black/50 border border-teal-800/30 rounded-lg p-3 overflow-x-auto code-scrollbar text-[0.85rem]">
                                  {children}
                                </pre>
                              ),
                              a: ({ href, children }) => (
                                <a
                                  href={href as string}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-teal-300 hover:text-teal-200 underline decoration-teal-400/50 hover:decoration-teal-200"
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {msg.reasoning as string}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </details>
                  </div>
                )}

                {/* Main Response */}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Code blocks
                    code: ({ className, children, ...props }) => (
                      <code
                        className="bg-black/50 text-teal-300 px-2 py-1 rounded text-base sm:text-lg border border-teal-800/30"
                        {...props}
                      >
                        {children}
                      </code>
                    ),
                    // Code blocks (fenced)
                    pre: ({ children }) => {
                      // Attempt to extract raw code string for copy functionality
                      let codeString = '';
                      if (Array.isArray(children)) {
                        const codeChild: any = children[0];
                        if (
                          codeChild &&
                          codeChild.props &&
                          Array.isArray(codeChild.props.children) &&
                          typeof codeChild.props.children[0] === 'string'
                        ) {
                          codeString = codeChild.props.children[0];
                        } else if (typeof codeChild === 'string') {
                          codeString = codeChild;
                        }
                      } else if (typeof children === 'string') {
                        codeString = children;
                      }

                      return (
                        <div className="relative group my-3">
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MessageActions content={codeString} isAssistant={false} />
                          </div>
                          <pre className="bg-black/50 border border-teal-800/30 rounded-lg p-4 overflow-x-auto code-scrollbar text-base sm:text-lg">
                            {children}
                          </pre>
                        </div>
                      );
                    },
                    // Images
                    img: ({ src, alt }) => (
                      <img
                        src={src}
                        alt={alt || ''}
                        className="max-w-full h-auto rounded-lg border border-teal-800/30 my-2"
                        style={{ maxHeight: '400px' }}
                      />
                    ),
                    // Headers
                    h1: ({ children }) => <h1 className="text-4xl sm:text-4xl text-white mb-6 mt-8 pb-3">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-3xl sm:text-3xl text-white mb-5 mt-7 pb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-2xl sm:text-2xl text-white mb-4 mt-6">{children}</h3>,
                    // Lists
                    ul: ({ children }) => (
                      <ul className="list-disc ml-6 space-y-2 text-gray-100 my-4">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal ml-6 space-y-2 text-gray-100 my-4">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="text-gray-100 leading-normal text-lg sm:text-xl">{children}</li>,
                    // Links
                    a: ({ href, children }) => (
                      <a
                        href={href as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-300 hover:text-teal-200 underline decoration-teal-400/50 hover:decoration-teal-200"
                      >
                        {children}
                      </a>
                    ),
                    // Blockquotes
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-teal-500/80 pl-6 italic text-gray-200 my-5 text-lg sm:text-xl leading-normal">
                        {children}
                      </blockquote>
                    ),
                    // Paragraphs
                    p: ({ children }) => (
                      <p className="text-gray-100 mb-3 text-lg sm:text-xl leading-normal">{children}</p>
                    ),
                    // Strong/Bold
                    strong: ({ children }) => (
                      <strong className="text-white">{children}</strong>
                    ),
                    // Emphasis/Italic
                    em: ({ children }) => <em className="italic text-gray-200">{children}</em>,
                  }}
                >
                  {typeof msg.content === 'string' ? msg.content : String(msg.content || '')}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="inline-block w-full">
                <div className="prose prose-invert prose-sm !max-w-none w-full text-lg text-gray-100">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                  >
                    {typeof msg.content === 'string' ? msg.content : String(msg.content || '')}
                  </ReactMarkdown>
                  {/* Render user attachments */}
                  {msg.attachments?.map(att => (
                    att.type.startsWith('audio/') ? (
                      <audio key={att.id} controls src={att.url || att.base64} className="mt-2 max-w-full" />
                    ) : att.type.startsWith('image/') ? (
                      <img key={att.id} src={att.url} alt={att.name} className="mt-2 rounded-lg border border-teal-800/30" />
                    ) : (
                      <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="block text-teal-300 mt-2 underline">
                        {att.name}
                      </a>
                    )
                  ))}
                </div>
              </div>
            )}
            {/* Assistant audio playback */}
            {msg.role === 'assistant' && msg.audio && (
              <audio controls autoPlay src={msg.audio} className="mt-4 w-full max-w-md" />
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