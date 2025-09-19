 
import type { User, Message, Conversation, Group } from '../types/chatTypes';
import { AUTH_ENDPOINTS, MESSAGE_ENDPOINTS, GROUP_ENDPOINTS } from '../constants/apiEndpoints';
import { ApiService } from '../constants/ApiService';

//
// Groups
//
export async function fetchGroupsInCommon(
  token: string,
  userId: string,
  logout: () => void
): Promise<Group[]> {
  return ApiService.makeGetRequest<Group[]>(
    GROUP_ENDPOINTS.COMMON(userId),
    token,
    logout,
    'fetching groups in common'
  );
}

//
// Users
//
export async function fetchUsers(token: string, logout: () => void): Promise<User[]> {
  return ApiService.makeGetRequest<User[]>(
    AUTH_ENDPOINTS.USERS,
    token,
    logout,
    'fetching users'
  );
}

//
// Conversations
//
export async function fetchConversations(token: string, logout: () => void): Promise<Conversation[]> {
  return ApiService.makeGetRequest<Conversation[]>(
    MESSAGE_ENDPOINTS.CONVERSATIONS,
    token,
    logout,
    'fetching conversations'
  );
}

//
// Messages
//
export async function fetchMessages(
  token: string,
  receiverId: string,
  logout: () => void
): Promise<Message[]> {
  const data = await ApiService.makeGetRequest<Message[]>(
    MESSAGE_ENDPOINTS.BY_RECEIVER(receiverId),
    token,
    logout,
    'fetching messages'
  );
    return Array.isArray(data) ? data : [];
}

export async function sendMessage(
  token: string,
  receiverId: string,
  text: string,
  messageType: 'text' | 'image' | 'video' = 'text',
  imageData?: string,
  videoData?: string
): Promise<Message | null> {
  const body: any = { receiverId, messageType };
  if (messageType === 'text') body.text = text;
  if (messageType === 'image' && imageData) body.imageData = imageData;
  if (messageType === 'video' && videoData) body.videoData = videoData;

  return ApiService.makeRequest<Message>(
    MESSAGE_ENDPOINTS.BASE,
    token,
    'POST',
    body,
    'sending message'
  );
}

export async function markMessagesAsRead(
  token: string,
  senderId: string
): Promise<{ modifiedCount: number } | null> {
  return ApiService.makeRequest<{ modifiedCount: number }>(
    MESSAGE_ENDPOINTS.MARK_READ(senderId),
    token,
    'PUT',
    undefined,
    'marking messages as read'
  );
}

export async function editMessage(token: string, messageId: string, text: string): Promise<Message | null> {
  return ApiService.makeRequest<Message>(
    MESSAGE_ENDPOINTS.EDIT(messageId),
    token,
    'PUT',
    { text },
    'editing message'
  );
}

export async function deleteMessageForMe(
  token: string,
  messageId: string
): Promise<{ message: string; messageId: string } | null> {
  return ApiService.makeRequest<{ message: string; messageId: string }>(
    MESSAGE_ENDPOINTS.DELETE_FOR_ME(messageId),
    token,
    'DELETE',
    undefined,
    'deleting message for me'
  );
}

export async function deleteMessageForEveryone(
  token: string,
  messageId: string
): Promise<{ message: string; messageId: string } | null> {
  return ApiService.makeRequest<{ message: string; messageId: string }>(
    MESSAGE_ENDPOINTS.DELETE_FOR_EVERYONE(messageId),
    token,
    'DELETE',
    undefined,
    'deleting message for everyone'
  );
}

//
// Blocking
//
export async function blockUser(token: string, userId: string): Promise<{ message: string } | null> {
  return ApiService.makeRequest<{ message: string }>(
    AUTH_ENDPOINTS.BLOCK(userId),
    token,
    'POST',
    undefined,
    'blocking user'
  );
}

export async function unblockUser(token: string, userId: string): Promise<{ message: string } | null> {
  return ApiService.makeRequest<{ message: string }>(
    AUTH_ENDPOINTS.UNBLOCK(userId),
    token,
    'POST',
    undefined,
    'unblocking user'
  );
}

export async function checkBlockStatus(
  token: string,
  userId: string
): Promise<{ isBlockedByMe: boolean; isBlockedByThem: boolean; isBlocked: boolean } | null> {
  return ApiService.makeGetRequest<{ isBlockedByMe: boolean; isBlockedByThem: boolean; isBlocked: boolean }>(
    AUTH_ENDPOINTS.BLOCK_STATUS(userId),
    token,
    undefined,
    'checking block status'
  );
}

export async function updateProfile(
  token: string,
  profileData: { bio?: string; profilePicture?: string }
): Promise<User> {
  const response = await ApiService.makeRequest<any>(
    AUTH_ENDPOINTS.PROFILE,
    token,
    'PUT',
    profileData,
    'updating profile'
  );
  return response?.user;
}

//
// Group management
//
export async function createGroup(
  token: string,
  name: string,
  description: string,
  memberIds: string[],
  icon?: string
): Promise<Group | null> {
  return ApiService.makeDataRequest<Group>(
    GROUP_ENDPOINTS.BASE,
    token,
    'POST',
    { name, description, memberIds, icon },
    'group',
    'creating group'
  );
}

export async function fetchUserGroups(token: string, logout: () => void): Promise<Group[]> {
  const data = await ApiService.makeGetRequest<{ groups: Group[] }>(
    GROUP_ENDPOINTS.BASE,
    token,
    logout,
    'fetching groups'
  );
  return data?.groups || [];
}

export async function fetchGroupDetails(token: string, groupId: string): Promise<Group | null> {
  const data = await ApiService.makeGetRequest<{ group: Group }>(
    GROUP_ENDPOINTS.BY_ID(groupId),
    token,
    undefined,
    'fetching group details'
  );
  return data?.group || null;
}

export async function addMembersToGroup(token: string, groupId: string, memberIds: string[]): Promise<Group | null> {
  return ApiService.makeRequest<{ group: Group }>(
    GROUP_ENDPOINTS.MEMBERS(groupId),
    token,
    'POST',
    { memberIds },
    'adding members'
  ).then(response => response?.group || null);
}

export async function removeMemberFromGroup(
  token: string,
  groupId: string,
  memberId: string
): Promise<{ message: string } | null> {
  return ApiService.makeRequest<{ message: string }>(
    GROUP_ENDPOINTS.MEMBER(groupId, memberId),
    token,
    'DELETE',
    undefined,
    'removing member'
  );
}

export async function leaveGroup(token: string, groupId: string): Promise<{ message: string } | null> {
  return ApiService.makeRequest<{ message: string }>(
    GROUP_ENDPOINTS.LEAVE(groupId),
    token,
    'DELETE',
    undefined,
    'leaving group'
  );
}

export async function fetchGroupMessages(
  token: string,
  groupId: string,
  page = 1,
  limit = 50
): Promise<Message[]> {
  const data = await ApiService.makeGetRequest<{ messages: Message[] }>(
    GROUP_ENDPOINTS.MESSAGES(groupId, page, limit),
    token,
    undefined,
    'fetching group messages'
  );
  return data?.messages || [];
}

export async function markGroupMessagesAsRead(
  token: string,
  groupId: string
): Promise<{ modifiedCount: number } | null> {
  return ApiService.makeRequest<{ modifiedCount: number }>(
    GROUP_ENDPOINTS.MARK_READ(groupId),
    token,
    'PUT',
    undefined,
    'marking group messages as read'
  );
}

export async function updateGroupIcon(token: string, groupId: string, icon: string): Promise<Group | null> {
  return ApiService.makeDataRequest<Group>(
    GROUP_ENDPOINTS.ICON(groupId),
    token,
    'PUT',
    { icon },
    undefined,
    'updating group icon'
  );
}

export async function removeGroupIcon(token: string, groupId: string): Promise<Group | null> {
  return ApiService.makeRequest<Group>(
    GROUP_ENDPOINTS.ICON(groupId),
    token,
    'DELETE',
    undefined,
    'removing group icon'
  );
}

export async function removeGroupMember(token: string, groupId: string, memberId: string): Promise<Group | null> {
  return ApiService.makeRequest<Group>(
    GROUP_ENDPOINTS.MEMBER(groupId, memberId),
    token,
    'DELETE',
    undefined,
    'removing group member'
  );
}
