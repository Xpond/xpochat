'use client';

import React, { useEffect, useState } from 'react';
import { UserButton } from "@clerk/nextjs";
import MessageList from './MessageList';
import ChatInputArea from './ChatInputArea';
import MobileChatInputArea from './MobileChatInputArea';
import ChatHistoryPanel, { ChatMeta } from './ChatHistoryPanel';
import SettingsPanel from './SettingsPanel';

interface MobileChatLayoutProps {
  // Panel states
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  
  // Chat state
  messages: any[];
  isTyping: boolean;
  isProcessing: boolean;
  isLoadingChat: boolean;
  currentChatId: string;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  
  // Input state
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  handleSendMessage: (messageData: string | { text: string; attachments: any[] }) => void;
  isConnected: boolean;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
  hasJoined: boolean;
  
  // Model and settings
  models: { defaultModels: any[]; byokProviders: any };
  activeApiKeys: string[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  messageCount: number;
  messageLimit: number;
  
  // Chat management
  chats: ChatMeta[];
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onDeleteChat: (chatId: string) => void;
  onBranchChat: (fromMessageIndex: number) => void;
  onRetryMessage?: (messageIndex: number) => void;
  onEditMessage?: (messageIndex: number, newContent: string) => void;
  
  // Settings panel props
  configuringProvider: string | null;
  setConfiguringProvider: React.Dispatch<React.SetStateAction<string | null>>;
  apiKeys: { [key: string]: string };
  setApiKeys: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  showApiKey: { [key: string]: boolean };
  setShowApiKey: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
  getToken: () => Promise<string | null>;
  fetchActiveKeys: () => Promise<void>;
  fetchModels: () => Promise<void>;
  selectedColor: string;
  setSelectedColor: React.Dispatch<React.SetStateAction<string>>;
  gradientType: string;
  setGradientType: React.Dispatch<React.SetStateAction<string>>;
  containerOpacity: number;
  setContainerOpacity: React.Dispatch<React.SetStateAction<number>>;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  chatFontSize: number;
  setChatFontSize: React.Dispatch<React.SetStateAction<number>>;
  changeTheme: (color: string, gradType?: string) => void;
  markThemeAdjustment: () => void;
  
  // Welcome suggestions
  starterSuggestions: string[];
}

const MobileChatLayout: React.FC<MobileChatLayoutProps> = ({
  // Panel states
  leftPanelOpen,
  rightPanelOpen,
  setLeftPanelOpen,
  setRightPanelOpen,
  
  // Chat state
  messages,
  isTyping,
  isProcessing,
  isLoadingChat,
  currentChatId,
  setMessages,
  
  // Input state
  inputText,
  setInputText,
  handleSendMessage,
  isConnected,
  isRecording,
  setIsRecording,
  hasJoined,
  
  // Model and settings
  models,
  activeApiKeys,
  selectedModel,
  setSelectedModel,
  messageCount,
  messageLimit,
  
  // Chat management
  chats,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onBranchChat,
  onRetryMessage,
  onEditMessage,
  
  // Settings panel props
  configuringProvider,
  setConfiguringProvider,
  apiKeys,
  setApiKeys,
  showApiKey,
  setShowApiKey,
  getToken,
  fetchActiveKeys,
  fetchModels,
  selectedColor,
  setSelectedColor,
  gradientType,
  setGradientType,
  containerOpacity,
  setContainerOpacity,
  fontSize,
  setFontSize,
  chatFontSize,
  setChatFontSize,
  changeTheme,
  markThemeAdjustment,
  
  // Welcome suggestions
  starterSuggestions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter chats based on search term
  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col relative overflow-hidden" style={{ height: '100dvh', maxHeight: '100dvh' }}>
      {/* Top Navigation Bar */}
      <header className="flex-shrink-0 h-16 flex items-center justify-between px-4 z-30 relative">
        {/* Left Panel Button */}
        <button
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm border border-teal-800/20 hover:bg-black/30 transition-all"
        >
          <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Center: Brand Name + User Button */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-light text-white tracking-wider brand-name">
            xpochat
          </h1>
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

        {/* Right Panel Button */}
        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm border border-teal-800/20 hover:bg-black/30 transition-all"
        >
          <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
        </button>
      </header>

      {/* Main Chat Container */}
      <main className="flex-1 flex flex-col min-h-0 p-2 overflow-hidden">
        <div
          style={{
            backgroundColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), var(--container-opacity, 0.26))`,
          }}
          className="flex-1 backdrop-blur-sm flex flex-col chat-font rounded-lg overflow-hidden min-h-0"
        >
          {/* Messages Area */}
          <div
            className="flex-1 min-h-0 px-4 pt-4 pb-2 overflow-y-auto scrollbar-hide"
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black calc(100% - 20px), transparent 100%)',
              maskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black calc(100% - 20px), transparent 100%)',
            }}
          >
            <MessageList 
              messages={messages} 
              isTyping={isTyping} 
              isProcessing={isProcessing} 
              setMessages={setMessages} 
              currentChatId={currentChatId}
              onBranchChat={onBranchChat}
              onRetryMessage={onRetryMessage}
              onEditMessage={onEditMessage}
              getToken={getToken}
            />

            {/* Welcome overlay - only show for truly empty chats, not during loading */}
            {messages.length === 0 && !isLoadingChat && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-6">
                <div className="pointer-events-auto max-w-xs w-full">
                  {/* Hero Section */}
                  <div className="mb-8 animate-fade-in-up">
                    <h2 className="text-3xl font-light bg-gradient-to-r from-teal-200 via-teal-300 to-teal-400 bg-clip-text text-transparent mb-6 tracking-tight">
                      Welcome to Xpochat
                    </h2>
                    <p className="text-base text-gray-300 font-light mb-4">
                      Lightning-fast AI
                    </p>
                    <p className="text-sm text-gray-400 font-light leading-relaxed">
                      Ask anything or try these starters
                    </p>
                  </div>

                  {/* Starter Suggestions */}
                  <div className="space-y-2 mb-6 animate-fade-in-up delay-200">
                    {starterSuggestions.slice(0, 3).map((suggestion, index) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSendMessage(suggestion)}
                        className="pointer-events-auto w-full group relative overflow-hidden bg-gradient-to-r from-black/20 to-black/10 hover:from-teal-900/30 hover:to-teal-800/20 border border-teal-700/30 hover:border-teal-500/50 rounded-xl p-3 text-left transition-all duration-300 hover:scale-[1.02]"
                        style={{ animationDelay: `${(index + 3) * 100}ms` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative z-10">
                          <div className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full mt-1.5 group-hover:bg-teal-300 transition-colors"></div>
                            <span className="text-gray-200 group-hover:text-white font-medium text-xs leading-relaxed transition-colors">
                              {suggestion}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Quick Tips */}
                  <div className="animate-fade-in-up delay-400">
                    <div className="flex items-center justify-center gap-4 text-xs text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-teal-400 rounded-full"></div>
                        Fast streaming
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-teal-400 rounded-full"></div>
                        Smart AI
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-light">
                      Tap the buttons above to access chats and settings
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
          <div className="flex-shrink-0">
            <MobileChatInputArea
              inputText={inputText}
              setInputText={setInputText}
              handleSendMessage={handleSendMessage}
              isConnected={isConnected}
              isRecording={isRecording}
              setIsRecording={setIsRecording}
              models={models}
              activeApiKeys={activeApiKeys}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              messageCount={messageCount}
              messageLimit={messageLimit}
              isProcessing={isProcessing}
              hasJoined={hasJoined}
              getToken={getToken}
            />
          </div>
        </div>
      </main>

      {/* Overlay Panels with Blur Background */}
      {(leftPanelOpen || rightPanelOpen) && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={() => {
            setLeftPanelOpen(false);
            setRightPanelOpen(false);
          }}
        />
      )}

      {/* Left Panel - Chat History */}
      {leftPanelOpen && (
        <div className="fixed top-4 left-4 bottom-4 w-72 sm:w-80 z-50 transition-transform duration-300 translate-x-0">
          <div 
            className="h-full pt-12 pb-4 px-4 rounded-xl"
            style={{
              backgroundColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), var(--container-opacity, 0.4))`,
            }}
          >
            <div className="h-full p-4 backdrop-blur-sm rounded-lg flex flex-col"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    onNewChat();
                    setLeftPanelOpen(false);
                  }}
                  style={{ borderColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.6)' }}
                  className="flex-1 py-2 rounded-lg bg-black/30 hover:bg-black/50 text-gray-300 transition-colors text-sm font-medium border"
                >
                  New Chat
                </button>
              </div>
              
              {/* Search Box removed temporarily on mobile */}
              
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-hide min-h-0">
                {filteredChats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors group cursor-pointer ${
                      chat.id === currentChatId ? '' : 'hover:bg-black/30'
                    }`}
                    style={chat.id === currentChatId ? { backgroundColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.3)' } : { backgroundColor: 'rgba(0,0,0,0.2)' }}
                    onClick={() => {
                      onSelectChat(chat.id);
                      setLeftPanelOpen(false);
                    }}
                  >
                    <span className="text-gray-300 truncate max-w-[12rem]" title={chat.title}>
                      {chat.title}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Rename */}
                      <button
                        className="p-1 rounded transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--teal-primary-rgb,20,184,166),0.4)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newTitle = prompt('Enter new title:', chat.title);
                          if (newTitle && newTitle.trim()) {
                            onRenameChat(chat.id, newTitle.trim());
                          }
                        }}
                      >
                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6M14 4a2 2 0 112.828 2.828L6 18l-4 1 1-4 12.828-12.828z" />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        className="p-1 rounded transition-colors hover:bg-red-800/40"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this chat?')) {
                            onDeleteChat(chat.id);
                          }
                        }}
                      >
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right Panel - Settings */}
      {rightPanelOpen && (
        <div className="fixed top-4 right-4 bottom-4 w-72 sm:w-80 z-50 transition-transform duration-300 translate-x-0">
          <div 
            className="h-full pt-12 pb-4 px-4 rounded-xl"
            style={{
              backgroundColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), var(--container-opacity, 0.4))`,
            }}
          >
            <div className="h-full p-4 backdrop-blur-sm rounded-lg overflow-hidden">
              <SettingsPanel
                rightPanelOpen={true}
                width="100%"
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
                onClose={() => {}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileChatLayout; 