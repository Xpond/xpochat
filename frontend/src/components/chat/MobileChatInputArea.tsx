'use client';

import React, { useState, useRef, useEffect } from 'react';
import ModelSelector from './ModelSelector';
import { fetchWithAuth } from '../../utils/fetchWithAuth';

interface MobileChatInputAreaProps {
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  handleSendMessage: (message: string | { text: string; attachments: any[] }) => void;
  isConnected: boolean;
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
  models: { defaultModels: any[]; byokProviders: any };
  activeApiKeys: string[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  messageCount: number;
  messageLimit: number;
  isProcessing: boolean;
  hasJoined: boolean;
  getToken: () => Promise<string | null>;
}

const MobileChatInputArea: React.FC<MobileChatInputAreaProps> = ({
  inputText,
  setInputText,
  handleSendMessage,
  isConnected,
  isRecording,
  setIsRecording,
  models,
  activeApiKeys,
  selectedModel,
  setSelectedModel,
  messageCount,
  messageLimit,
  isProcessing,
  hasJoined,
  getToken,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording'>('idle');

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // Clear attachments and revoke any object URLs after send
  useEffect(() => {
    if (!inputText.trim() && attachments.length > 0) {
      attachments.forEach((att) => {
        if (att.preview && att.preview.startsWith('blob:')) {
          URL.revokeObjectURL(att.preview);
        }
      });
      setAttachments([]);
    }
  }, [inputText]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      const id = `att_${Date.now()}_${Math.random()}`;
      const isImage = file.type.startsWith('image/');
      
      // Create preview for images
      let preview = '';
      if (isImage) {
        preview = URL.createObjectURL(file);
      }
      
      // Add to attachments with uploading state
      setAttachments(prev => [...prev, {
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        uploading: true,
        preview,
        file
      }]);
      
      // Upload file
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const resp = await fetchWithAuth(getToken, '/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!resp?.ok) {
          console.error('Upload failed');
          setAttachments(prev => prev.filter(a => a.id !== id));
          return;
        }
        
        const data = await resp.json();
        const backendBase = process.env.NODE_ENV === 'production' 
          ? 'https://xpochat-backend.onrender.com' 
          : 'http://localhost:3001';
        const url = typeof data.url === 'string' && data.url.startsWith('http') 
          ? data.url 
          : `${backendBase}${data.url}`;
        
        // Convert file to base64 for AI processing
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result as string;
          
          setAttachments(prev =>
            prev.map(a =>
              a.id === id ? {
                ...a,
                uploading: false,
                url,
                preview: isImage ? url : a.preview,
                serverId: data.attachmentId,
                extractedText: data.extractedText || undefined,
                base64: base64Data,
              } : a
            )
          );
        };
        reader.readAsDataURL(file);
        
      } catch (err) {
        console.error('Error uploading file:', err);
        setAttachments(prev => prev.filter(a => a.id !== id));
      } finally {
        if (preview) URL.revokeObjectURL(preview);
      }
    }
  };

  const handleRecordClick = async () => {
    if (recordingState === 'recording') {
      // Cancel recording completely
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        const stream = mediaRecorderRef.current.stream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
      setRecordingState('idle');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
          
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64 = e.target?.result as string;
            if (base64) {
              const attachments = [{
                id: `voice_${Date.now()}`,
                name: file.name,
                type: file.type,
                base64: base64,
                url: base64
              }];
              
              handleSendMessage({
                text: '',
                attachments: attachments
              });
            }
          };
          reader.readAsDataURL(file);
        }
        setRecordingState('idle');
      };

      mediaRecorder.start();
      setRecordingState('recording');
    } catch (err) {
      console.error('Failed to start recording', err);
      setRecordingState('idle');
    }
  };

  const handleStopAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendMessage = () => {
    if (!inputText.trim() && attachments.length === 0) return;
    if (!isConnected || !hasJoined || isProcessing) return;

    if (attachments.length > 0) {
      handleSendMessage({ text: inputText, attachments });
    } else {
      handleSendMessage(inputText);
    }
    setInputText('');
    setAttachments([]);
  };

  // Check if using default model (for trial counter)
  const isDefaultModel = models.defaultModels.some(m => m.id === selectedModel);

  return (
    <div className="p-3 space-y-2">
      {/* Top Row: Model Selector + Trial Counter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <ModelSelector
            models={models}
            activeApiKeys={activeApiKeys}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            className="w-full"
          />
        </div>
        
        {/* Message Count Display - Only show for default models (trial) */}
        {isDefaultModel && (
          <div
            className={`px-3 py-2 bg-black/20 rounded-lg text-sm border transition-colors flex-shrink-0 ${
              messageCount >= messageLimit
                ? 'border-red-500/50 text-red-300'
                : messageCount >= messageLimit * 0.8
                ? 'border-yellow-500/50 text-yellow-300'
                : 'border-teal-800/20 text-teal-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  messageCount >= messageLimit
                    ? 'bg-red-400'
                    : messageCount >= messageLimit * 0.8
                    ? 'bg-yellow-400'
                    : 'bg-teal-400'
                }`}
              ></div>
              <span className="text-xs">
                {messageCount}/{messageLimit}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input Row */}
      <div
        className="relative bg-black/30 backdrop-blur-sm border border-teal-800/30 rounded-lg p-3"
        style={{
          backgroundColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), var(--container-opacity, 0.26))`,
        }}
      >
        <div className="flex items-end gap-3">
          {/* Voice Recording Button */}
          <button
            type="button"
            onClick={handleRecordClick}
            className={`p-2 rounded-lg transition-all duration-200 focus:outline-none flex-shrink-0 ${
              recordingState === 'recording'
                ? 'animate-pulse bg-teal-500/20 text-teal-400 border border-teal-500/30'
                : 'text-gray-400 hover:text-teal-300 hover:bg-black/30 border border-transparent'
            }`}
            title={recordingState === 'recording' ? 'Cancel Recording' : 'Start Voice Message'}
            aria-label={recordingState === 'recording' ? 'Cancel Recording' : 'Start Voice Message'}
          >
            {recordingState === 'recording' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <line x1="12" x2="12" y1="18" y2="22" />
                <line x1="8" x2="16" y1="22" y2="22" />
              </svg>
            )}
          </button>

          {/* Send voice message button - only show when recording */}
          {recordingState === 'recording' && (
            <button
              type="button"
              onClick={handleStopAndSend}
              className="p-2 rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors focus:outline-none flex-shrink-0"
              title="Send Voice Message"
              aria-label="Send Voice Message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          )}

          {/* Attachment Button */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowAttachMenu(p => !p)}
              type="button"
              className="attach-button p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-black/30"
              aria-label="Attachments"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {showAttachMenu && (
              <div className="attach-menu absolute bottom-full mb-2 left-0 bg-black/80 backdrop-blur-md border border-teal-800/30 rounded-lg shadow-xl z-50 min-w-[160px]">
                <button
                  type="button"
                  className="block w-full px-4 py-2 text-sm text-gray-200 hover:bg-teal-800/30 text-left"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setShowAttachMenu(false);
                  }}
                >
                  Upload a file
                </button>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* Text Input */}
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isConnected && hasJoined ? 'Type your message...' : 'Connecting...'}
              className="w-full bg-transparent text-white placeholder-gray-400 resize-none border-none outline-none overflow-y-auto scrollbar-hide"
              rows={1}
              style={{ maxHeight: '120px' }}
              disabled={!isConnected || !hasJoined || isProcessing}
            />
          </div>

          {/* Send Button */}
          <button
            onClick={sendMessage}
            disabled={!isConnected || !hasJoined || (!inputText.trim() && attachments.length === 0) || isProcessing}
            style={{ borderColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.6)' }}
            className={`px-4 py-2 rounded-lg transition-all font-medium flex-shrink-0 border disabled:opacity-50 disabled:cursor-not-allowed ${
              isProcessing
                ? 'bg-teal-600/70 text-white cursor-not-allowed'
                : 'bg-black/30 hover:bg-black/50 text-gray-300'
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span className="hidden sm:inline">Processing...</span>
              </div>
            ) : isConnected ? (
              'Send'
            ) : (
              '...'
            )}
          </button>
        </div>

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="mt-3 flex gap-3 flex-wrap">
            {attachments.map((att) => (
              <div key={att.id} className="relative">
                {att.type.startsWith('image/') && att.preview ? (
                  <img
                    src={att.preview}
                    alt={att.name}
                    className="w-16 h-16 object-cover rounded border border-teal-800/30"
                  />
                ) : att.type === 'application/pdf' ? (
                  <div className="w-16 h-16 flex flex-col items-center justify-center bg-red-900/20 border border-red-800/30 rounded text-xs text-red-300">
                    <svg className="w-4 h-4 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    PDF
                  </div>
                ) : att.type.startsWith('audio/') ? (
                  <div className="w-16 h-16 flex flex-col items-center justify-center bg-blue-900/20 border border-blue-800/30 rounded text-xs text-blue-300">
                    <svg className="w-4 h-4 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12,3V13.55C11.41,13.21 10.73,13 10,13A3,3 0 0,0 7,16A3,3 0 0,0 10,19A3,3 0 0,0 13,16V7H16V5H12V3Z" />
                    </svg>
                    AUDIO
                  </div>
                ) : (
                  <div className="w-16 h-16 flex flex-col items-center justify-center bg-gray-900/20 border border-gray-800/30 rounded text-xs text-gray-300">
                    <svg className="w-4 h-4 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    FILE
                  </div>
                )}
                
                {/* Upload progress indicator */}
                {att.uploading && (
                  <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                  className="absolute -top-2 -right-2 bg-black/70 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileChatInputArea; 