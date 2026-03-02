import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import { useSocketEvents } from '../hooks/useSocketEvents';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import FriendsPanel from '../components/FriendsPanel';
import SettingsPanel from '../components/SettingsPanel';
import styles from './ChatPage.module.css';
import api from '../utils/api';

const ChatPage = () => {
  const { user } = useAuthStore();
  const { activeConversationId, fetchConversations, setActiveConversation, addConversation } = useChatStore();
  const [showFriends, setShowFriends] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useSocketEvents();

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleOpenChat = async (userId) => {
    try {
      const { data } = await api.post(`/conversations/direct/${userId}`);
      addConversation(data);
      setActiveConversation(data.id);
      setShowFriends(false);
    } catch {}
  };

  return (
    <div className={styles.app}>
      <Sidebar
        onOpenSettings={() => { setShowSettings(true); setShowFriends(false); }}
        onOpenFriends={() => { setShowFriends(true); setShowSettings(false); }}
      />

      <div className={styles.main}>
        {activeConversationId ? (
          <ChatWindow conversationId={activeConversationId} />
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyInner}>
              <div className={styles.emptyIcon}>
                <MessageSquare size={48} />
              </div>
              <h2>Добро пожаловать в ДАЛЕКС</h2>
              <p>Выберите чат или найдите пользователя для начала общения</p>
            </div>
          </div>
        )}
      </div>

      {showFriends && (
        <FriendsPanel
          onClose={() => setShowFriends(false)}
          onOpenChat={handleOpenChat}
        />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
};

export default ChatPage;
