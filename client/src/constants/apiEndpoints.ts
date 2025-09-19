const API_URL = import.meta.env.VITE_API_URL;

// Authentication endpoints
export const AUTH_ENDPOINTS = {
  LOGIN: `${API_URL}/api/auth/login`,
  REGISTER: `${API_URL}/api/auth/register`,
  USERS: `${API_URL}/api/auth/users`,
  PROFILE: `${API_URL}/api/auth/profile`,
  BLOCK: (userId: string) => `${API_URL}/api/auth/block/${userId}`,
  UNBLOCK: (userId: string) => `${API_URL}/api/auth/unblock/${userId}`,
  BLOCK_STATUS: (userId: string) => `${API_URL}/api/auth/block-status/${userId}`,
} as const;

// Message endpoints
export const MESSAGE_ENDPOINTS = {
  BASE: `${API_URL}/api/messages`,
  CONVERSATIONS: `${API_URL}/api/messages/conversations`,
  BY_RECEIVER: (receiverId: string) => `${API_URL}/api/messages/${receiverId}`,
  MARK_READ: (senderId: string) => `${API_URL}/api/messages/mark-read/${senderId}`,
  EDIT: (messageId: string) => `${API_URL}/api/messages/edit/${messageId}`,
  DELETE_FOR_ME: (messageId: string) => `${API_URL}/api/messages/delete-for-me/${messageId}`,
  DELETE_FOR_EVERYONE: (messageId: string) => `${API_URL}/api/messages/delete-for-everyone/${messageId}`,
} as const;

// Group endpoints
export const GROUP_ENDPOINTS = {
  BASE: `${API_URL}/api/groups`,
  BY_ID: (groupId: string) => `${API_URL}/api/groups/${groupId}`,
  COMMON: (userId: string) => `${API_URL}/api/groups/common/${userId}`,
  MEMBERS: (groupId: string) => `${API_URL}/api/groups/${groupId}/members`,
  MEMBER: (groupId: string, memberId: string) => `${API_URL}/api/groups/${groupId}/members/${memberId}`,
  LEAVE: (groupId: string) => `${API_URL}/api/groups/${groupId}/leave`,
  MESSAGES: (groupId: string, page = 1, limit = 50) => 
    `${API_URL}/api/groups/${groupId}/messages?page=${page}&limit=${limit}`,
  MARK_READ: (groupId: string) => `${API_URL}/api/groups/${groupId}/mark-read`,
  ICON: (groupId: string) => `${API_URL}/api/groups/${groupId}/icon`,
} as const;
