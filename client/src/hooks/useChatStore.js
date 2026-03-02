import { create } from 'zustand';
import api from '../utils/api';
import { getSocket } from '../utils/socket';

const useChatStore = create((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  friends: [],
  friendRequests: [],
  onlineUsers: new Set(),

  // Conversations
  fetchConversations: async () => {
    const { data } = await api.get('/conversations');
    set({ conversations: data });
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id });
    if (id) {
      const socket = getSocket();
      socket?.emit('messages:read', { conversationId: id });
      // Clear unread
      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, unread_count: 0 } : c
        )
      }));
    }
  },

  // Messages
  fetchMessages: async (conversationId, before = null) => {
    const params = { limit: 50 };
    if (before) params.before = before;
    const { data } = await api.get(`/conversations/${conversationId}/messages`, { params });

    set(state => {
      const existing = state.messages[conversationId] || [];
      const existingIds = new Set(existing.map(m => m.id));
      const newMsgs = data.filter(m => !existingIds.has(m.id));
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...newMsgs, ...existing]
        }
      };
    });
    return data;
  },

  addMessage: (message) => {
    const convId = message.conversation_id;
    set(state => {
      const existing = state.messages[convId] || [];
      if (existing.find(m => m.id === message.id)) return state;

      const updatedConvs = state.conversations.map(c => {
        if (c.id !== convId) return c;
        const isActive = state.activeConversationId === convId;
        return {
          ...c,
          last_message: message,
          updated_at: message.created_at,
          unread_count: isActive ? 0 : (c.unread_count || 0) + 1
        };
      });

      // Sort conversations by latest
      updatedConvs.sort((a, b) => b.updated_at - a.updated_at);

      return {
        messages: { ...state.messages, [convId]: [...existing, message] },
        conversations: updatedConvs
      };
    });
  },

  editMessage: (conversationId, messageId, content, updatedAt) => {
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map(m =>
          m.id === messageId ? { ...m, content, is_edited: 1, updated_at: updatedAt } : m
        )
      }
    }));
  },

  deleteMessage: (conversationId, messageId) => {
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map(m =>
          m.id === messageId ? { ...m, is_deleted: 1, content: 'Сообщение удалено' } : m
        )
      }
    }));
  },

  // Typing
  setTyping: (conversationId, userId, username, isTyping) => {
    set(state => {
      const convTyping = { ...(state.typingUsers[conversationId] || {}) };
      if (isTyping) convTyping[userId] = username;
      else delete convTyping[userId];
      return { typingUsers: { ...state.typingUsers, [conversationId]: convTyping } };
    });
  },

  // Friends
  fetchFriends: async () => {
    const { data } = await api.get('/friends');
    set({ friends: data });
  },

  fetchFriendRequests: async () => {
    const { data } = await api.get('/friends/requests');
    set({ friendRequests: data });
  },

  // Online users
  setUserOnline: (userId) => {
    set(state => {
      const next = new Set(state.onlineUsers);
      next.add(userId);
      return {
        onlineUsers: next,
        friends: state.friends.map(f => f.id === userId ? { ...f, is_online: 1 } : f)
      };
    });
  },

  setUserOffline: (userId, lastSeen) => {
    set(state => {
      const next = new Set(state.onlineUsers);
      next.delete(userId);
      return {
        onlineUsers: next,
        friends: state.friends.map(f =>
          f.id === userId ? { ...f, is_online: 0, last_seen: lastSeen } : f
        )
      };
    });
  },

  addConversation: (conv) => {
    set(state => {
      if (state.conversations.find(c => c.id === conv.id)) return state;
      return { conversations: [conv, ...state.conversations] };
    });
  },
}));

export default useChatStore;
