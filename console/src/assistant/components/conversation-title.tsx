import { useState, useRef, useEffect } from 'react';
import type { ChatSession } from '../types/types';
import { ChevronRight, ChevronDown, X, Pencil } from 'lucide-react';

interface ConversationTitleProps {
  session?: ChatSession | null;
  onNewChat?: () => void;
  onEditConversation?: (newTitle: string, newDescription: string) => void;
}

export function ConversationTitle({
  session,
  onNewChat,
  onEditConversation,
}: ConversationTitleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Always render to maintain layout, even if just default title
  const displayTitle = session?.title || 'New Conversation';
  const displayDescription = session?.lastMessage || 'No visible messages';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      setEditTitle(displayTitle);
      setEditDescription(displayDescription);
      setIsExpanded(true); // Auto-expand when editing
    }
  }, [isEditing, displayTitle, displayDescription]);

  // If no session, show nothing (clean state for new chat)
  // MOVED AFTER HOOKS to prevent React Hook Error
  if (!session) {
    return null;
  }

  const handleSave = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    if (
      onEditConversation &&
      (editTitle !== displayTitle || editDescription !== displayDescription)
    ) {
      onEditConversation(editTitle, editDescription);
    }
    setIsEditing(false);
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditTitle(displayTitle);
    setEditDescription(displayDescription);
    setIsExpanded(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Allow Shift+Enter for description newlines if needed, but here mainly for Title
      // If focusing title, maybe save? Or just let user click check.
      // Actually, Enter in Input = Save. Enter in Textarea = Newline.
      if (document.activeElement === inputRef.current) {
        handleSave(e);
      }
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className="px-4 py-3 sticky top-0 z-20 transition-colors">
      <div
        className="group flex flex-col bg-card/90 backdrop-blur-md border border-border shadow-sm transition-all duration-200 cursor-pointer hover:border-ring/20 rounded-lg"
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between px-3 py-2 w-full">
          {/* Main Editing Area (Left Column: Inputs) */}
          {isEditing ? (
            <div
              className="flex-1 flex flex-col gap-2 w-full mr-2"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title Input */}
              <input
                ref={inputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-background text-foreground text-sm px-2 py-1.5 rounded border border-input outline-none focus:border-ring w-full"
                placeholder="Conversation title..."
              />
              {/* Description Textarea (Aligned right below Title) */}
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="bg-background text-muted-foreground text-xs font-mono p-2 rounded border border-input outline-none focus:border-ring resize-none h-20 w-full"
                placeholder="Description..."
              />
              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-2 mt-1">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            /* Standard View (Icon + Title) */
            <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}

              <h2
                className={`text-sm font-medium text-foreground ${isExpanded ? '' : 'truncate'}`}
                title={displayTitle}
              >
                {displayTitle}
              </h2>

              {/* Edit Button (Visible on Hover) */}
              <button
                onClick={handleStartEdit}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-all text-muted-foreground hover:text-foreground"
                title="Edit conversation"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Right Column: Actions (Only for Non-Editing) */}
          {!isEditing && (
            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
              <button
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5 hover:bg-muted rounded"
                title="New Chat"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent toggling when clicking close
                  if (onNewChat) onNewChat();
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Expanded Description (Only show in Standard View Mode, Hidden during Edit as it's moved up) */}
        {isExpanded && !isEditing && (
          <div
            className="px-3 pb-3 pl-9 animate-in fade-in slide-in-from-top-1 duration-200 cursor-auto"
            onClick={(e) => isEditing && e.stopPropagation()}
          >
            <p className="text-xs text-muted-foreground font-mono leading-relaxed line-clamp-3 break-words">
              {displayDescription &&
              displayDescription !== 'No visible messages'
                ? displayDescription
                : 'Start a conversation to see details here...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
