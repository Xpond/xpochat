'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import remarkGfm from 'remark-gfm';
import { highlightCode } from '../../../utils/syntaxHighlighter';

// Optimized code extraction and highlighting for shared chats
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function SharedChatPage() {
  const params = useParams() as { chatId?: string };
  const chatId = params.chatId as string;
  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSharedChat = async () => {
      try {
        const response = await fetch(`/api/share/${chatId}`);
        
        if (!response.ok) {
          setError(response.status === 404 ? 'This chat is not publicly shared or does not exist.' : 'Failed to load shared chat.');
          return;
        }

        const data = await response.json();
        setChat(data.chat);
        
        try {
          const parsedMessages = JSON.parse(data.chat.context || '[]');
          setMessages(parsedMessages);
        } catch (err) {
          console.error('Failed to parse messages:', err);
          setMessages([]);
        }
      } catch (err) {
        setError('Failed to load shared chat.');
      } finally {
        setLoading(false);
      }
    };

    if (chatId) fetchSharedChat();
  }, [chatId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-teal-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading shared chat...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-teal-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h1 className="text-2xl font-bold text-white mb-2">Chat Not Found</h1>
          <p className="text-gray-300 mb-6">{error}</p>
          <Link href="/" className="inline-flex items-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
            Go to Xpochat
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-teal-900">
      {/* Header */}
      <header className="border-b border-gray-700/50 bg-black/20 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-light text-white tracking-wider hover:text-teal-300 transition-colors">
              xpochat
            </Link>
            <p className="text-sm text-gray-400 mt-1">Shared Chat</p>
          </div>
          <Link href="/" className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-md transition-colors">
            Start Chatting
          </Link>
        </div>
      </header>

      {/* Chat Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">{chat?.title || 'Shared Chat'}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>Model: {chat?.model}</span>
            <span>•</span>
            <span>Shared: {chat?.sharedAt ? new Date(chat.sharedAt).toLocaleDateString() : 'Unknown'}</span>
            {messages.length > 0 && (
              <>
                <span>•</span>
                <span>{messages.length} messages</span>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">This shared chat is empty.</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={msg.id || index}>
                {index > 0 && (
                  <div className="flex justify-center mb-6">
                    <div className="w-1/2 h-px bg-gradient-to-r from-transparent via-teal-800/20 to-transparent"></div>
                  </div>
                )}

                <div className={`w-full ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                              <div className={`inline-block w-full max-w-4xl`}>
              <div className="prose prose-invert prose-sm !max-w-none w-full text-lg text-gray-100">
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
                            const highlightedHtml = highlightCode(code, language);

                            return (
                              <pre className="bg-black/60 border border-teal-800/30 rounded-lg p-4 overflow-x-auto code-scrollbar text-sm font-mono shadow-sm my-4">
                                <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                              </pre>
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
                  </div>

                  <div className={`flex items-center gap-2 text-xs opacity-50 mt-2 ${
                    msg.role === 'user' ? 'justify-end text-right' : 'justify-start text-left'
                  }`}>
                    <span>{msg.role === 'user' ? 'User' : 'Assistant'}</span>
                    <span>•</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer CTA */}
        <div className="mt-16 text-center py-8 border-t border-gray-700/50">
          <h3 className="text-xl font-semibold text-white mb-2">Try Xpochat</h3>
          <p className="text-gray-400 mb-4">Start your own AI conversations with lightning-fast responses</p>
          <Link href="/" className="inline-flex items-center px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
            Start Chatting
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </main>
    </div>
  );
} 