'use client';

import React, { useState } from 'react';

export type ChatMeta = { id: string; title: string; created: number };

// Reusable simple modal component
const Modal: React.FC<{ open: boolean; title: string; children: React.ReactNode; onClose: () => void }> = ({ open, title, children, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-80 bg-black/90 border rounded-lg p-6 backdrop-blur-md" style={{ borderColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.4)' }}>
        <h3 className="text-lg font-medium mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
};

interface ChatHistoryPanelProps {
  leftPanelOpen: boolean;
  width: string;
  chats: ChatMeta[];
  currentChatId: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onDeleteChat: (chatId: string) => void;
  /** Callback fired when the mouse leaves the panel so the parent can close it. */
  onClose: () => void;
}

/**
 * Sliding left panel that shows chat history.  Behaviour and markup are
 * copied from the previous inline implementation in page.tsx but the
 * data-mutating actions (select, new, rename, delete) are delegated to the
 * parent via callback props so all side-effects remain in the page module.
 */
const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
  leftPanelOpen,
  width,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onClose,
}) => {
  // --- NEW: Search term & multi-select state ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // --- Modal state ---
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [confirmSingleId, setConfirmSingleId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; current: string } | null>(null);

  const multiSelectActive = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteConfirmed = () => {
    selectedIds.forEach((id) => onDeleteChat(id));
    setSelectedIds(new Set());
    setConfirmBulkOpen(false);
  };

  // Ensure unique chat IDs to avoid React key duplication warnings.
  const uniqueChats = React.useMemo(() => {
    // Later chats (most recent) should override earlier ones with the same id.
    const map = new Map<string, ChatMeta>();
    // Iterate in reverse so that earlier items are overwritten by later ones – respecting sort order.
    for (let i = chats.length - 1; i >= 0; i--) {
      const c = chats[i];
      map.set(c.id, c);
    }
    // Ensure newest chats appear first
    return Array.from(map.values()).sort((a, b) => b.created - a.created);
  }, [chats]);

  const filteredChats = uniqueChats.filter((chat) =>
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside
      style={{ 
        width, 
        top: '5rem', 
        bottom: '1rem', 
        backgroundColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), var(--container-opacity, 0.26))`
      }}
      onMouseLeave={onClose}
      className={`fixed left-0 backdrop-blur-sm p-4 pl-8 transition-transform duration-300 z-20 flex flex-col overflow-hidden container-font rounded-lg ${
        leftPanelOpen ? 'translate-x-0' : '-translate-x-[110%]'
      }`}
    >
      {/* Action Buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={onNewChat}
          style={{ borderColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.6)' }}
          className="flex-1 py-2 rounded-lg bg-black/30 hover:bg-black/50 text-gray-300 transition-colors text-sm font-medium border"
        >
          New Chat
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setConfirmBulkOpen(true)}
            className="px-3 py-2 bg-red-800/30 text-red-300 rounded-lg hover:bg-red-800/50 transition-colors text-sm font-medium"
            title="Delete selected"
          >
            <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Search Box */}
      <input
        type="text"
        placeholder="Search..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ borderColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.6)' }}
        className="w-full mb-3 px-3 py-2 bg-black/30 text-white rounded-lg placeholder-gray-500 focus:outline-none border text-sm"
      />

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-hide">
        {filteredChats.map((chat) => (
          <div
            key={chat.id}
            className={`flex items-center justify-between p-3 rounded-lg transition-colors group ${
              chat.id === currentChatId ? '' : 'hover:bg-black/30'
            }`}
            style={chat.id === currentChatId ? { backgroundColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.3)' } : { backgroundColor: 'rgba(0,0,0,0.2)' }}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selectedIds.has(chat.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleSelect(chat.id);
                }}
                onClick={(e) => e.stopPropagation()}
                className={`form-checkbox h-4 w-4 rounded-sm transition-opacity duration-200 bg-black/30 ${selectedIds.has(chat.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                style={{ accentColor: 'rgb(var(--teal-primary-rgb,20,184,166))', borderColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.6)' }}
              />
              <span
                className="text-gray-300 truncate max-w-[12rem]"
                title={chat.title}
              >
                {chat.title}
              </span>
            </div>
            {!multiSelectActive && (
            <div
              className="opacity-0 group-hover:opacity-100 flex gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Rename */}
              <button
                className="p-1 rounded transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--teal-primary-rgb,20,184,166),0.4)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameTarget({ id: chat.id, current: chat.title });
                }}
              >
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6M14 4a2 2 0 112.828 2.828L6 18l-4 1 1-4 12.828-12.828z"
                  />
                </svg>
              </button>

              {/* Delete (single) */}
              <button
                className="p-1 rounded hover:bg-red-700/40"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmSingleId(chat.id);
                }}
              >
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
            )}
          </div>
        ))}
      </div>

      {/* Bulk delete confirmation */}
      <Modal open={confirmBulkOpen} title="Delete selected chats?" onClose={() => setConfirmBulkOpen(false)}>
        <p className="text-sm text-gray-300 mb-4">
          This will permanently delete {selectedIds.size} chat{selectedIds.size === 1 ? '' : 's'}. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 bg-white/10 rounded" onClick={() => setConfirmBulkOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded" style={{ backgroundColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.3)', color: 'rgb(var(--teal-primary-rgb,20,184,166))' }} onClick={handleBulkDeleteConfirmed}>Delete</button>
        </div>
      </Modal>

      {/* Single delete confirmation */}
      <Modal open={!!confirmSingleId} title="Delete this chat?" onClose={() => setConfirmSingleId(null)}>
        <p className="text-sm text-gray-300 mb-4">This action cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 bg-white/10 rounded" onClick={() => setConfirmSingleId(null)}>Cancel</button>
          <button className="px-4 py-2 rounded" style={{ backgroundColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.3)', color: 'rgb(var(--teal-primary-rgb,20,184,166))' }}
            onClick={() => {
              if (confirmSingleId) onDeleteChat(confirmSingleId);
              setConfirmSingleId(null);
            }}
          >Delete</button>
        </div>
      </Modal>

      {/* Rename dialog */}
      <Modal open={!!renameTarget} title="Rename chat" onClose={() => setRenameTarget(null)}>
        {renameTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('title') as HTMLInputElement).value.trim();
              if (input) {
                onRenameChat(renameTarget.id, input);
                setRenameTarget(null);
              }
            }}
          >
            <input
              name="title"
              defaultValue={renameTarget.current}
              className="w-full mb-4 px-3 py-2 bg-black/30 text-white rounded border"
              style={{ borderColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.6)' }}
            />
            <div className="flex justify-end gap-3">
              <button type="button" className="px-4 py-2 bg-white/10 rounded" onClick={() => setRenameTarget(null)}>Cancel</button>
              <button type="submit" className="px-4 py-2 rounded" style={{ backgroundColor: 'rgba(var(--teal-primary-rgb,20,184,166),0.3)', color: 'rgb(var(--teal-primary-rgb,20,184,166))' }}>Save</button>
            </div>
          </form>
        )}
      </Modal>
    </aside>
  );
};

export default ChatHistoryPanel; 