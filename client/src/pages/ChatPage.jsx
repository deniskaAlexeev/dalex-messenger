import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import { useSocketEvents } from '../hooks/useSocketEvents';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import FriendsPanel from '../components/FriendsPanel';
import SettingsPanel from '../components/SettingsPanel';
import FeedPage from './FeedPage';
import styles from './ChatPage.module.css';
import api from '../utils/api';

const ChatPage = () => {
  const { user } = useAuthStore();
  const { activeConversationId, fetchConversations, setActiveConversation, addConversation } = useChatStore();
  const [showFriends, setShowFriends] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'

  useSocketEvents();

  useEffect(() => { fetchConversations(); }, []);

  const handleSelectConversation = (id) => {
    setActiveConversation(id);
    setMobileView('chat');
    setShowFeed(false);
  };

  const handleOpenChat = async (userId) => {
    try {
      const { data } = await api.post(`/conversations/direct/${userId}`);
      addConversation(data);
      setActiveConversation(data.id);
      setShowFriends(false);
      setShowFeed(false);
      setMobileView('chat');
    } catch {}
  };

  const handleBackToSidebar = () => {
    setMobileView('sidebar');
    setActiveConversation(null);
  };

  return (
    <div className={styles.app}>
      <div className={`${styles.sidebarWrap} ${mobileView === 'chat' || showFeed ? styles.hideMobile : ''}`}>
        <Sidebar
          onOpenSettings={() => { setShowSettings(true); setShowFriends(false); }}
          onOpenFriends={() => { setShowFriends(true); setShowSettings(false); }}
          onOpenFeed={() => { setShowFeed(true); setMobileView('chat'); }}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      <div className={`${styles.main} ${mobileView === 'sidebar' && !showFeed ? styles.hideMobile : ''}`}>
        {showFeed ? (
          <FeedPage onBack={() => { setShowFeed(false); setMobileView('sidebar'); }} />
        ) : activeConversationId ? (
          <ChatWindow conversationId={activeConversationId} onBack={handleBackToSidebar} />
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyInner}>
              <div className={styles.emptyIcon}><MessageSquare size={48} /></div>
              <h2>Добро пожаловать в ДАЛЕКС</h2>
              <p>Выберите чат слева или откройте ленту</p>
            </div>
          </div>
        )}
      </div>

      {showFriends && <FriendsPanel onClose={() => setShowFriends(false)} onOpenChat={handleOpenChat} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default ChatPage;
