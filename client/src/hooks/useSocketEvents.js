import { useEffect } from 'react';
import { getSocket } from '../utils/socket';
import useChatStore from './useChatStore';

export const useSocketEvents = () => {
  const {
    addMessage, editMessage, deleteMessage,
    setTyping, setUserOnline, setUserOffline
  } = useChatStore();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMessage = (message) => {
      addMessage(message);
    };

    const onMessageEdited = ({ messageId, conversationId, content, updatedAt }) => {
      editMessage(conversationId, messageId, content, updatedAt);
    };

    const onMessageDeleted = ({ messageId, conversationId }) => {
      deleteMessage(conversationId, messageId);
    };

    const onTypingStart = ({ userId, username, conversationId }) => {
      setTyping(conversationId, userId, username, true);
    };

    const onTypingStop = ({ userId, conversationId }) => {
      setTyping(conversationId, userId, null, false);
    };

    const onUserOnline = ({ userId }) => setUserOnline(userId);
    const onUserOffline = ({ userId, lastSeen }) => setUserOffline(userId, lastSeen);

    socket.on('message:new', onNewMessage);
    socket.on('message:edited', onMessageEdited);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:edited', onMessageEdited);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
    };
  }, []);
};
