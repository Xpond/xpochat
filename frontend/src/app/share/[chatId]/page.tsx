'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function SharedChatPage() {
  const params = useParams();
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
                  <div className={`inline-block max-w-4xl ${msg.role === 'user' ? 'max-w-sm' : ''}`}>
                    <div className="prose prose-invert prose-sm max-w-none text-lg text-gray-100">
                      <ReactMarkdown>
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