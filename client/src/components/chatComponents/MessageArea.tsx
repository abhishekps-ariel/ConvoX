import React, { useRef, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { formatMessageDate, shouldShowDateSeparator } from "../../utils/dateUtils";
import { editMessage, deleteMessageForMe, deleteMessageForEveryone } from "../../services/api";
import type { Message } from "../../types/chatTypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan } from "@fortawesome/free-solid-svg-icons";

interface MessageAreaProps {
  messages: Message[];
  showScrollButton: boolean;
  onScrollToBottom: () => void;
  onOpenImageViewer: (imageUrl: string) => void;
  onOpenVideoViewer: (videoUrl: string) => void;
  forceScrollToBottom?: boolean; // New prop to force scroll to bottom
  onMessageEdit?: (messageId: string, newText: string) => void;
  onMessageDelete?: (messageId: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket?: any; // Socket instance for real-time editing
  isGroupChat?: boolean; // New prop to indicate if this is a group chat
}

const MessageArea: React.FC<MessageAreaProps> = ({
  messages,
  showScrollButton,
  onScrollToBottom,
  onOpenImageViewer,
  onOpenVideoViewer,
  forceScrollToBottom = false,
  onMessageEdit,
  onMessageDelete,
  socket,
  isGroupChat = false,
}) => {
  const { user, token } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState<string | null>(null);

  // Helper function to determine if we should show sender name (WhatsApp-style)
  const shouldShowSenderName = (message: Message, previousMessage: Message | null): boolean => {
    if (!isGroupChat) return false; // Only show sender names in group chats
    
    // Always show sender name for the first message
    if (!previousMessage) return true;
    
    // Don't show sender name for system messages
    if (message.messageType === 'system') return false;
    
    // Show sender name if the previous message is from a different sender
    if (previousMessage.sender._id !== message.sender._id) return true;
    
    // Show sender name if the previous message is a system message
    if (previousMessage.messageType === 'system') return true;
    
    // Don't show sender name if the previous message is from the same sender
    return false;
  };

  // scroll to bottom when messages update
  useEffect(() => {
    const messagesContainer = messagesEndRef.current?.parentElement;
    if (!messagesContainer) return;

    // If forceScrollToBottom is true, always scroll to bottom instantly
    if (forceScrollToBottom) {
      // Use a small delay to ensure DOM is updated, then scroll instantly
      setTimeout(() => {
        const messagesContainer = messagesEndRef.current?.parentElement;
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 10);
      return;
    }

    // Otherwise, only scroll if user is near bottom
    const isNearBottom =
      messagesContainer.scrollTop + messagesContainer.clientHeight >=
      messagesContainer.scrollHeight - 100;

    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, forceScrollToBottom]);

  // close delete menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDeleteMenu) {
        const target = event.target as Element;
        if (!target.closest('.relative')) {
          setShowDeleteMenu(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDeleteMenu]);


  const handleEditMessage = (message: Message) => {
    setEditingMessageId(message._id);
    setEditText(message.text);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editText.trim() || isEditing) return;

    try {
      setIsEditing(true);
      
      if (socket && socket.connected) {
        // Use socket for real-time editing
        socket.emit("editMessage", {
          messageId: editingMessageId,
          text: editText.trim()
        });
        
        // Call the parent callback if provided
        if (onMessageEdit) {
          onMessageEdit(editingMessageId, editText.trim());
        }
        
        setEditingMessageId(null);
        setEditText("");
        setIsEditing(false);
      } else {
        // Fallback to API if socket not available
        if (token) {
          await editMessage(token, editingMessageId, editText.trim());
        }
        
        // Call the parent callback if provided
        if (onMessageEdit) {
          onMessageEdit(editingMessageId, editText.trim());
        }
        
        setEditingMessageId(null);
        setEditText("");
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error editing message:', error);
      alert(error instanceof Error ? error.message : 'Failed to edit message');
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditText("");
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const canEditMessage = (message: Message) => {
    if (message.sender._id !== user?.id || message.messageType !== 'text') {
      return false;
    }
    
    // Check if message is older than 12 hours
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    return messageAge <= twelveHoursInMs;
  };

  const canDeleteForEveryone = (message: Message) => {
    if (message.sender._id !== user?.id) {
      return false;
    }
    
    // Check if message is older than 12 hours
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    return messageAge <= twelveHoursInMs;
  };

  const isMessageDeleted = (message: Message) => {
    // Only hide messages for "delete for me", not for "delete for everyone"
    
    // For group messages, check if the current user deleted it for themselves
    if (message.group) {
      // If the current user is the sender, check deletedForSender
      if (message.sender._id === user?.id) {
        return message.deletedForSender;
      } else {
        // If the current user is not the sender, check if they're in deletedForUsers array
        return message.deletedForUsers && message.deletedForUsers.includes(user?.id || '');
      }
    }
    
    // For direct messages, use the original logic
    if (message.sender._id === user?.id) {
      return message.deletedForSender;
    } else {
      return message.deletedForReceiver;
    }
  };

  const shouldShowDeletedMessage = (message: Message) => {
    // Show "This message was deleted" only for "delete for everyone"
    return message.deletedForEveryone;
  };


  const handleDeleteForMe = async (messageId: string) => {
    if (!token || isDeleting) return;

    try {
      setIsDeleting(true);
      
      if (socket && socket.connected) {
        // Use socket for real-time deletion
        socket.emit("deleteMessageForMe", { messageId });
        // Call the parent callback to update group list immediately
        if (onMessageDelete) {
          onMessageDelete(messageId);
        }
      } else {
        // Fallback to API if socket not available
        await deleteMessageForMe(token, messageId);
        // Call the parent callback for API response
        if (onMessageDelete) {
          onMessageDelete(messageId);
        }
      }
      
      setIsDeleting(false);
    } catch (error) {
      console.error('Error deleting message for me:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete message');
      setIsDeleting(false);
    }
  };

  const handleDeleteForEveryone = async (messageId: string) => {
    if (!token || isDeleting) return;

    try {
      setIsDeleting(true);
      
      if (socket && socket.connected) {
        // Use socket for real-time deletion
        socket.emit("deleteMessageForEveryone", { messageId });
      } else {
        // Fallback to API if socket not available
        await deleteMessageForEveryone(token, messageId);
        // Call the parent callback for API response
        if (onMessageDelete) {
          onMessageDelete(messageId);
        }
      }
      
      setIsDeleting(false);
    } catch (error) {
      console.error('Error deleting message for everyone:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete message');
      setIsDeleting(false);
    }
  };


  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 relative">
      {showScrollButton && (
        <button
          onClick={onScrollToBottom}
          className="absolute bottom-4 right-6 z-10 bg-white text-gray-600 rounded-full p-2 shadow-lg border border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-colors duration-200"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
      {messages.map((message, index) => {
        const previousMessage = index > 0 ? messages[index - 1] : null;
        const showDateSeparator = shouldShowDateSeparator(
          message.createdAt,
          previousMessage?.createdAt || null
        );

        // Completely hide the message if it's deleted for the current user
        if (isMessageDeleted(message)) {
          return null;
        }

        // Handle system messages differently
        if (message.messageType === 'system') {
          // For removal messages, show different text based on whether current user was removed
          let displayText = message.text;
          if (message.text.includes('was removed from this group') && (message as any).removedMemberId) {
            const removedMemberId = (message as any).removedMemberId;
            if (removedMemberId === user?.id) {
              displayText = "You were removed from this group";
            }
            // Otherwise, keep the original text (e.g., "Abhishek was removed from this group")
          }

          return (
            <React.Fragment key={message._id}>
              {showDateSeparator && (
                <div className="flex justify-center my-6">
                  <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm font-medium">
                    {formatMessageDate(message.createdAt)}
                  </div>
                </div>
              )}
              <div className="flex justify-center mb-4">
                <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm italic max-w-[70%] text-center">
                  {displayText}
                </div>
              </div>
            </React.Fragment>
          );
        }

        const showSenderName = shouldShowSenderName(message, previousMessage);

        return (
          <React.Fragment key={message._id}>
            {showDateSeparator && (
              <div className="flex justify-center my-6">
                <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm font-medium">
                  {formatMessageDate(message.createdAt)}
                </div>
              </div>
            )}
            {/* Show sender name for group chats (WhatsApp-style) */}
            {showSenderName && (
              <div className={`flex mb-1 ${message.sender._id === user?.id ? "justify-end" : "justify-start"}`}>
                <div className="text-xs text-gray-500 px-2">
                  {message.sender._id === user?.id ? "You" : message.sender.username}
                </div>
              </div>
            )}
            <div
              className={`flex mb-4 ${
                message.sender._id === user?.id
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div className="relative group max-w-[70%]">
              <div
                  className={`px-4 py-3 rounded-2xl break-words shadow-sm ${
                  message.messageType === 'image' || message.messageType === 'video'
                      ? 'max-w-full' 
                      : 'max-w-full'
                } ${
                  message.sender._id === user?.id
                      ? "bg-gray-900 text-white rounded-br-md"
                      : "bg-white text-gray-900 rounded-bl-md border border-gray-200 shadow-sm"
                  }`}
                >
                  {editingMessageId === message._id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={handleKeyPress}
                        className="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed"
                        rows={Math.max(1, editText.split('\n').length)}
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                          disabled={isEditing}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-900 text-white rounded transition-colors"
                          disabled={isEditing || !editText.trim()}
                        >
                          {isEditing ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {shouldShowDeletedMessage(message) ? (
                        <div className="flex items-center text-gray-400 italic">
                          <FontAwesomeIcon icon={faBan} />
                              This message was deleted
                        </div>
                      ) : (
                        <>
                {message.messageType === 'image' && message.imageUrl ? (
                  <div className="mb-2">
                    <img
                      src={message.imageUrl}
                      alt="Shared image"
                      className="max-w-full h-auto max-h-64 rounded-lg cursor-pointer object-cover hover:opacity-90 transition-opacity"
                      onClick={() => message.imageUrl && onOpenImageViewer(message.imageUrl)}
                    />
                  </div>
                ) : message.messageType === 'video' && message.videoUrl ? (
                  <div className="mb-2">
                    <video
                      src={message.videoUrl}
                      className="max-w-full h-auto max-h-64 rounded-lg cursor-pointer object-cover hover:opacity-90 transition-opacity"
                      controls
                      onClick={() => message.videoUrl && onOpenVideoViewer(message.videoUrl)}
                    />
                  </div>
                ) : (
                <p className="text-sm leading-relaxed">
                  {message.text}
                </p>
                )}
                          <div className="flex items-center justify-between mt-2">
                <span
                              className={`text-xs ${
                    message.sender._id === user?.id
                                  ? "text-gray-300"
                      : "text-gray-500"
                  }`}
                >
                  {new Date(message.createdAt).toLocaleTimeString('en-US', {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true
                  })}
                              {message.isEdited && (
                                <span className="ml-1 italic">(edited)</span>
                              )}
                </span>
                            
                            {/* Read status ticks - only show for sent messages */}
                            {message.sender._id === user?.id && !message.group && (
                              <div className="flex items-center">
                                {message.isRead ? (
                                  // Double tick (read) - BLUE
                                  <div className="flex">
                                    <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                    </svg>
                                    <svg className="w-3 h-3 text-blue-500 -ml-1" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                    </svg>
                                  </div>
                                ) : (
                                  // Single tick (sent but not read) - GRAY
                                  <svg className="w-4 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                  </svg>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
                
                {/* Floating Three Dots Button - appears on hover */}
                {!isMessageDeleted(message) && !shouldShowDeletedMessage(message) && (
                  <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowDeleteMenu(showDeleteMenu === message._id ? null : message._id);
                        }}
                        className="bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 rounded-full p-1.5 shadow-sm border border-gray-200"
                        title="Message options"
                        disabled={isDeleting}
                        style={{ zIndex: 9999 }}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                        </svg>
                      </button>
                      
                      {/* Context Menu Dropdown */}
                      {showDeleteMenu === message._id && (
                        <div className={`absolute bottom-8 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50 min-w-48 ${
                          message.sender._id === user?.id ? 'right-0' : 'left-0'
                        }`}>
                          {/* Edit option - only show for own messages that can be edited */}
                          {message.sender._id === user?.id && canEditMessage(message) && editingMessageId !== message._id && (
                            <button
                              onClick={() => {
                                handleEditMessage(message);
                                setShowDeleteMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit message
                            </button>
                          )}
                          
                          {/* Delete for me option */}
                          <button
                            onClick={() => {
                              handleDeleteForMe(message._id);
                              setShowDeleteMenu(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                            disabled={isDeleting}
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Delete for me
                          </button>
                          
                          {/* Delete for everyone option */}
                          {canDeleteForEveryone(message) && (
                            <button
                              onClick={() => {
                                handleDeleteForEveryone(message._id);
                                setShowDeleteMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
                              disabled={isDeleting}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete for everyone
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div ref={messagesEndRef} />
      
    </div>
  );
};

export default MessageArea;
