import React, { useState } from 'react';
import { fetchWithAuth } from '../../utils/fetchWithAuth';

interface MessageActionsProps {
  content: string;
  chatId?: string;
  messageIndex?: number;
  getToken?: () => Promise<string | null>;
  onBranch?: (fromMessageIndex: number) => void;
  isAssistant?: boolean;
  messages?: any[]; // Add messages prop for sharing
}

const MessageActions: React.FC<MessageActionsProps> = ({ 
  content, 
  chatId, 
  messageIndex, 
  getToken, 
  onBranch, 
  isAssistant = false,
  messages = []
}) => {
  const [states, setStates] = useState({
    copied: false,
    shared: false,
    branching: false,
    sharing: false
  });

  const updateState = (key: keyof typeof states, value: boolean) => {
    setStates(prev => ({ ...prev, [key]: value }));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      updateState('copied', true);
      setTimeout(() => updateState('copied', false), 1500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  const handleShare = async () => {
    if (!chatId || !getToken) return;
    
    updateState('sharing', true);
    try {
      const response = await fetchWithAuth(getToken, `/api/chats/${chatId}/share`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages })
      });

      if (response?.ok) {
        const shareUrl = `${window.location.origin}/share/${chatId}`;
        await navigator.clipboard.writeText(shareUrl);
        updateState('shared', true);
        setTimeout(() => updateState('shared', false), 2000);
      }
    } catch (err) {
      console.error('Share failed', err);
    } finally {
      updateState('sharing', false);
    }
  };

  const handleBranch = async () => {
    if (!onBranch || messageIndex === undefined) return;
    
    updateState('branching', true);
    try {
      await onBranch(messageIndex);
    } catch (err) {
      console.error('Branch failed', err);
    } finally {
      updateState('branching', false);
    }
  };

  const ActionButton = ({ 
    onClick, 
    title, 
    disabled = false, 
    children 
  }: { 
    onClick: () => void; 
    title: string; 
    disabled?: boolean; 
    children: React.ReactNode 
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-teal-300 hover:text-teal-200 focus:outline-none bg-teal-800/20 hover:bg-teal-800/30 p-1 rounded transition-colors disabled:opacity-50"
      title={title}
    >
      {children}
    </button>
  );

  const SpinIcon = () => (
    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );

  const CheckIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );

  return (
    <div className="flex items-center gap-2">
      {/* Copy Button */}
      <ActionButton onClick={handleCopy} title={states.copied ? 'Copied!' : 'Copy'}>
        {states.copied ? <CheckIcon /> : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M16 8h2a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-2" />
          </svg>
        )}
      </ActionButton>

      {/* Share & Branch buttons only for assistant messages */}
      {isAssistant && chatId && getToken && (
        <>
          <ActionButton 
            onClick={handleShare} 
            title={states.shared ? 'Link copied!' : 'Share chat'}
            disabled={states.sharing}
          >
            {states.sharing ? <SpinIcon /> : states.shared ? <CheckIcon /> : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            )}
          </ActionButton>

          <ActionButton 
            onClick={handleBranch} 
            title="Branch conversation from here"
            disabled={states.branching}
          >
            {states.branching ? <SpinIcon /> : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2-2-2M19 12H9" />
              </svg>
            )}
          </ActionButton>
        </>
      )}
    </div>
  );
};

export default MessageActions; 