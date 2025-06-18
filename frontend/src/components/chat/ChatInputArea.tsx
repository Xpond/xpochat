'use client';

import React, { useRef, useEffect, KeyboardEvent, useState } from 'react';
import ModelSelector from './ModelSelector';
import { fetchWithAuth } from '../../utils/fetchWithAuth';

interface ChatInputAreaProps {
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

/**
 * Renders the input area (textarea, buttons, model selector, message counter)
 * exactly as it existed inside ChatPage.  Includes the textarea auto-resize
 * logic that was previously in a useEffect in ChatPage.
 */
const ChatInputArea: React.FC<ChatInputAreaProps> = ({
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

  // Show/hide small attachment menu
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'ready'>('idle');

  interface AttachmentMeta {
    id: string;
    name: string;
    type: string;
    preview: string; // local preview (object URL or placeholder)
    url?: string; // final uploaded URL
    uploading: boolean;
    base64?: string; // base64 data for AI processing
    serverId?: string;
    extractedText?: string;
  }

  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);

  // === Voice recording ===
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Auto-resize the textarea based on content height while keeping
  // the placeholder fully visible and preventing premature scrollbars.
  useEffect(() => {
    if (textareaRef.current) {
      // Reset to auto to correctly calculate the new scrollHeight
      textareaRef.current.style.height = 'auto';
      // Set to the scrollHeight, capping at 120 px (same as maxHeight)
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [inputText]);

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendWithAttachments();
    }
  };

  const isDefaultModel = models.defaultModels.some((m: any) => m.id === selectedModel);

  // Handle file selection (from click or paste)
  const handleFiles = async (files: FileList | File[]) => {
    if (!getToken) return;

    const fileArray = Array.from(files);
    for (const file of fileArray) {
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
        continue;
      }

      const id = `att_${Date.now()}_${Math.random()}`;
      const isImage = file.type.startsWith('image/');
      const localUrl = isImage ? URL.createObjectURL(file) : '';

      // Add to UI immediately
      setAttachments((prev) => [...prev, {
        id,
        name: file.name,
        type: file.type,
        preview: localUrl || '/default-file-icon.png',
        uploading: true,
      }]);

      // Get token for upload
      const token = await getToken();
      if (!token) {
        console.error('No auth token for upload');
        setAttachments((prev) => prev.filter((a) => a.id !== id));
        return;
      }

      // Async upload
      const formData = new FormData();
      formData.append('file', file);

      const backendBase = (process.env.NEXT_PUBLIC_BACKEND_HTTP_URL as string) || `${window.location.protocol}//${window.location.hostname}:3001`;

      (async () => {
        try {
          const resp = await fetchWithAuth(getToken, '/api/upload', {
            method: 'POST',
            body: formData,
          });
          if (!resp?.ok) {
            console.error('Upload failed');
            // Mark as failed (optional): remove attachment preview
            setAttachments((prev) => prev.filter((a) => a.id !== id));
            return;
          }
          const data = await resp.json();
          const url = typeof data.url === 'string' && data.url.startsWith('http') ? data.url : `${backendBase}${data.url}`;

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? {
                ...a,
                uploading: false,
                url,
                preview: isImage ? url : a.preview,
                serverId: data.attachmentId,
                extractedText: data.extractedText || undefined,
              } : a
            )
          );

          // Store final URL on attachment; do not insert markdown into textarea
          // Markdown will be appended only when the user presses Send
          setInputText((prev: string) => prev); // no-op; keeps cursor position
        } catch (err) {
          console.error('Error uploading file:', err);
          setAttachments((prev) => prev.filter((a) => a.id !== id));
        } finally {
          if (localUrl) URL.revokeObjectURL(localUrl);
        }
      })();
    }
  };

  // Clear attachments and revoke any object URLs after send
  useEffect(() => {
    if (!inputText.trim()) {
      attachments.forEach((att) => {
        if (att.preview && att.preview.startsWith('blob:')) {
          URL.revokeObjectURL(att.preview);
        }
      });
      setAttachments([]);
    }
  }, [inputText]);

  // Paste handler for images
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageItems.push(file);
        }
      }
      if (imageItems.length) {
        e.preventDefault();
        handleFiles(imageItems);
      }
    };
    el.addEventListener('paste', onPaste as any);
    return () => el.removeEventListener('paste', onPaste as any);
  }, [getToken]);

  // Close attachment menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!target) return;
      if (showAttachMenu && !((target as HTMLElement).closest('.attach-menu') || (target as HTMLElement).closest('.attach-button'))) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAttachMenu]);

  // Build final message and dispatch
  const sendWithAttachments = () => {
    if (!inputText.trim() && attachments.length === 0) return;

    // Prepare message with attachments
    const messageData = {
      text: inputText.trim(),
      attachments: attachments
        .filter((a) => a.url) // only uploaded/finished items
        .map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          url: a.url,
          base64: a.base64,
          text: a.extractedText,
        })),
    };

    handleSendMessage(messageData);

    // Reset
    setInputText('');
    attachments.forEach((att) => {
      if (att.preview && att.preview.startsWith('blob:')) URL.revokeObjectURL(att.preview);
    });
    setAttachments([]);
  };

  // === Voice recording handler (defined after handleFiles so we can call it) ===
  const handleRecordClick = async () => {
    if (recordingState === 'recording') {
      // Cancel recording completely
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.ondataavailable = null; // Prevent data processing
        mediaRecorderRef.current.onstop = null; // Prevent stop processing
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        // Release microphone immediately
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
        // Release microphone
        stream.getTracks().forEach(track => track.stop());
        
        // Only process if we have data and recording wasn't cancelled
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
          
          // Convert to base64 and send immediately - bypass attachment system
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64 = e.target?.result as string;
            if (base64) {
              // Send voice message immediately
              const attachments = [{
                id: `voice_${Date.now()}`,
                name: file.name,
                type: file.type,
                base64: base64,
                url: base64
              }];
              
              handleSendMessage({
                text: '', // No text, just voice
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
      mediaRecorderRef.current.stop(); // This will trigger onstop which sends the message
    }
  };

  return (
    <div className="px-6 pb-0">
      <div className="mx-auto max-w-4xl bg-black/30 border border-teal-800/30 rounded-xl p-4">
        <div className="flex items-center gap-3 relative">
          {/* Voice recording button – placed to the LEFT of the typing area */}
          <button
            type="button"
            onClick={handleRecordClick}
            className={`mr-2 p-2 rounded-lg transition-all duration-200 focus:outline-none
              ${recordingState === 'recording'
                ? 'animate-pulse bg-teal-500/20 text-teal-400 border border-teal-500/30'
                : 'text-gray-400 hover:text-teal-300 hover:bg-black/30 border border-transparent'}`}
            title={recordingState === 'recording' ? 'Cancel Recording' : 'Start Voice Message'}
            aria-label={recordingState === 'recording' ? 'Cancel Recording' : 'Start Voice Message'}
          >
            {recordingState === 'recording' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
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
              className="mr-2 p-2 rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors focus:outline-none"
              title="Send Voice Message"
              aria-label="Send Voice Message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          )}

          <div className="flex-1">
            <textarea
              ref={textareaRef}
              id="message-input"
              name="message"
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
          <div className="flex gap-2 items-center">
            {/* Attachment control */}
            <div className="relative">
              <button
                onClick={() => setShowAttachMenu((p) => !p)}
                type="button"
                className="attach-button p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-black/30"
                aria-label="Attachments"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {showAttachMenu && (
                <div className="attach-menu absolute bottom-full mb-2 right-0 bg-black/80 backdrop-blur-md border border-teal-800/30 rounded-lg shadow-xl z-50 min-w-[160px]">
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
            </div>

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

            {/* Message Count Display - Only show for default models (trial) */}
            {isDefaultModel && (
              <div
                className={`px-3 py-2 bg-black/20 rounded-lg text-sm border transition-colors ${
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
                  <span>
                    {messageCount}/{messageLimit}
                  </span>
                </div>
              </div>
            )}

            {/* Model Selector */}
            <ModelSelector
              models={models}
              activeApiKeys={activeApiKeys}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
            />

            <button
              onClick={sendWithAttachments}
              disabled={!isConnected || !hasJoined || (!inputText.trim() && attachments.length===0) || isProcessing}
              className={`px-4 py-2 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                isProcessing
                  ? 'bg-teal-600/70 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-600 to-teal-500 hover:shadow-lg'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </div>
              ) : isConnected ? (
                'Send'
              ) : (
                '...'
              )}
            </button>
          </div>
        </div>

        {/* Attachments preview thumbnails */}
        {attachments.length > 0 && (
          <div className="mt-3 flex gap-3 flex-wrap">
            {attachments.map((att) => (
              <div key={att.id} className="relative">
                {att.type.startsWith('image/') && att.preview ? (
                  <img
                    src={att.preview}
                    alt={att.name}
                    className="w-20 h-20 object-cover rounded border border-teal-800/30"
                  />
                ) : att.type === 'application/pdf' ? (
                  <div className="w-20 h-20 flex flex-col items-center justify-center bg-red-900/20 border border-red-800/30 rounded text-xs text-red-300">
                    <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    PDF
                  </div>
                ) : att.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || att.type === 'application/msword' ? (
                  <div className="w-20 h-20 flex flex-col items-center justify-center bg-blue-900/20 border border-blue-800/30 rounded text-xs text-blue-300">
                    <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    DOC
                  </div>
                ) : (
                  <div className="w-20 h-20 flex flex-col items-center justify-center bg-gray-900/20 border border-gray-800/30 rounded text-xs text-gray-300">
                    <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    FILE
                  </div>
                )}

                {att.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded">
                    <svg className="w-6 h-6 text-teal-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3.536-3.536A9.953 9.953 0 0112 2C6.477 2 2 6.477 2 12h2z" />
                    </svg>
                  </div>
                )}

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => {
                    // revoke object URL if needed
                    if (att.preview && att.preview.startsWith('blob:')) URL.revokeObjectURL(att.preview);
                    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
                  }}
                  className="absolute -top-2 -right-2 bg-black/70 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  aria-label="Remove attachment"
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

export default ChatInputArea; 