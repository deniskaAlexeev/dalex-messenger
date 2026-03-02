import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Users, Settings, LogOut, MessageSquare, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import Avatar from './Avatar';
import { formatConversationTime, getInitials } from '../utils/format';
import api from '../utils/api';
import styles from './Sidebar.module.css';

const Sidebar = ({ onOpenSettings, onOpenFriends }) => {
  const { user, logout } = useAuthStore();
  const { conversations, activeConversationId, setActiveConversation, addConversation, fetchConversations } = useChatStore();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [tab, setTab] = useState('chats'); // chats | search

  const handleLogout = async () => {
    await logout();
    toast.success('Вы вышли из аккаунта');
  };

  const handleSearch = async (q) => {
    setSearch(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleOpenChat = async (userId) => {
    try {
      const { data } = await api.post(`/conversations/direct/${userId}`);
      addConversation(data);
      setActiveConversation(data.id);
      setSearch('');
      setSearchResults([]);
      setTab('chats');
    } catch (err) {
      toast.error('Не удалось открыть чат');
    }
  };

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  const filteredConversations = search
    ? conversations.filter(c => {
        const name = c.type === 'direct'
          ? (c.other_user?.display_name || c.other_user?.username)
          : c.name;
        return name?.toLowerCase().includes(search.toLowerCase());
      })
    : conversations;

  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <MessageSquare size={18} />
          </div>
          <span className={styles.brandName}>ДАЛЕКС</span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={onOpenFriends}
            title="Друзья"
          >
            <Users size={18} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={onOpenSettings}
            title="Настройки"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <Search size={15} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Поиск пользователей..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className={styles.list}>
        {search && (
          <div className={styles.searchSection}>
            <p className={styles.sectionLabel}>Пользователи</p>
            {searchLoading ? (
              <div className={styles.loading}>Поиск...</div>
            ) : searchResults.length === 0 ? (
              <div className={styles.empty}>Никого не найдено</div>
            ) : searchResults.map(u => (
              <button
                key={u.id}
                className={styles.userItem}
                onClick={() => handleOpenChat(u.id)}
              >
                <Avatar user={u} size={40} showOnline />
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{u.display_name}</span>
                  <span className={styles.userSub}>@{u.username}</span>
                </div>
                {u.isFriend && <span className={styles.friendBadge}>Друг</span>}
              </button>
            ))}
            <div className={styles.divider} />
            <p className={styles.sectionLabel}>Чаты</p>
          </div>
        )}

        {filteredConversations.length === 0 && !search ? (
          <div className={styles.emptyState}>
            <MessageSquare size={32} className={styles.emptyIcon} />
            <p>Нет чатов</p>
            <p className={styles.emptyHint}>Найдите пользователя через поиск</p>
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isActive = conv.id === activeConversationId;
            const otherUser = conv.other_user;
            const name = conv.type === 'direct'
              ? (otherUser?.display_name || otherUser?.username)
              : conv.name;

            const lastMsg = conv.last_message;
            let lastText = '';
            if (lastMsg) {
              lastText = lastMsg.is_deleted ? 'Сообщение удалено' : lastMsg.content;
              if (lastText.length > 40) lastText = lastText.slice(0, 40) + '...';
            }

            return (
              <button
                key={conv.id}
                className={`${styles.convItem} ${isActive ? styles.convItemActive : ''}`}
                onClick={() => setActiveConversation(conv.id)}
              >
                <Avatar user={otherUser} size={46} showOnline />
                <div className={styles.convInfo}>
                  <div className={styles.convTop}>
                    <span className={styles.convName}>{name}</span>
                    {conv.last_message && (
                      <span className={styles.convTime}>
                        {formatConversationTime(conv.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  <div className={styles.convBottom}>
                    <span className={styles.convPreview}>
                      {lastText || 'Нет сообщений'}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className={styles.unreadBadge}>
                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* User bar */}
      <div className={styles.userBar}>
        <Avatar user={user} size={36} showOnline />
        <div className={styles.userBarInfo}>
          <span className={styles.userBarName}>{user?.display_name}</span>
          <span className={styles.userBarUsername}>@{user?.username}</span>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Выйти">
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
