import React, { useState } from 'react';
import { Search, Users, Settings, LogOut, MessageSquare, Newspaper } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import Avatar from './Avatar';
import { formatConversationTime } from '../utils/format';
import api from '../utils/api';
import styles from './Sidebar.module.css';

const Sidebar = ({ onOpenSettings, onOpenFriends, onOpenFeed, onSelectConversation }) => {
  const { user, logout } = useAuthStore();
  const { conversations, activeConversationId, setActiveConversation, addConversation } = useChatStore();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Вы вышли из аккаунта');
  };

  const handleSearch = async (q) => {
    setSearch(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  };

  const handleOpenChat = async (userId) => {
    try {
      const { data } = await api.post(`/conversations/direct/${userId}`);
      addConversation(data);
      const id = data.id;
      setActiveConversation(id);
      onSelectConversation?.(id);
      setSearch(''); setSearchResults([]);
    } catch { toast.error('Не удалось открыть чат'); }
  };

  const handleSelectConv = (id) => {
    setActiveConversation(id);
    onSelectConversation?.(id);
  };

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
      <div className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><MessageSquare size={18} /></div>
          <span className={styles.brandName}>ДАЛЕКС</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={onOpenFeed} title="Лента"><Newspaper size={18} /></button>
          <button className={styles.iconBtn} onClick={onOpenFriends} title="Друзья"><Users size={18} /></button>
          <button className={styles.iconBtn} onClick={onOpenSettings} title="Настройки"><Settings size={18} /></button>
        </div>
      </div>

      <div className={styles.searchWrap}>
        <Search size={15} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Поиск пользователей..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      <div className={styles.list}>
        {search && (
          <>
            <p className={styles.sectionLabel}>Пользователи</p>
            {searchLoading ? <div className={styles.loading}>Поиск...</div>
              : searchResults.length === 0 ? <div className={styles.empty}>Никого не найдено</div>
              : searchResults.map(u => (
                <button key={u.id} className={styles.userItem} onClick={() => handleOpenChat(u.id)}>
                  <Avatar user={u} size={40} showOnline />
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{u.display_name}</span>
                    <span className={styles.userSub}>@{u.username}</span>
                  </div>
                  {u.isFriend && <span className={styles.friendBadge}>Друг</span>}
                </button>
              ))
            }
            <div className={styles.divider} />
            <p className={styles.sectionLabel}>Чаты</p>
          </>
        )}

        {filteredConversations.length === 0 && !search ? (
          <div className={styles.emptyState}>
            <MessageSquare size={32} className={styles.emptyIcon} />
            <p>Нет чатов</p>
            <p className={styles.emptyHint}>Найдите пользователя через поиск</p>
          </div>
        ) : filteredConversations.map(conv => {
          const isActive = conv.id === activeConversationId;
          const name = conv.type === 'direct'
            ? (conv.other_user?.display_name || conv.other_user?.username)
            : (conv.name || 'Групповой чат');
          const lastMsg = conv.last_message;
          let lastText = lastMsg
            ? (lastMsg.is_deleted ? 'Сообщение удалено' : lastMsg.content)
            : 'Нет сообщений';
          if (lastText.length > 38) lastText = lastText.slice(0, 38) + '...';

          // Для групп показываем иконку группы, для личных — аватар
          const avatarUser = conv.type === 'direct' ? conv.other_user : { display_name: name, avatar_color: '#a855f7' };

          return (
            <button
              key={conv.id}
              className={`${styles.convItem} ${isActive ? styles.convItemActive : ''}`}
              onClick={() => handleSelectConv(conv.id)}
            >
              <div className={styles.convAvatarWrap}>
                <Avatar user={avatarUser} size={46} showOnline={conv.type === 'direct'} />
                {conv.type === 'group' && (
                  <span className={styles.groupBadge}><Users size={10} /></span>
                )}
              </div>
              <div className={styles.convInfo}>
                <div className={styles.convTop}>
                  <span className={styles.convName}>{name}</span>
                  {lastMsg && <span className={styles.convTime}>{formatConversationTime(lastMsg.created_at)}</span>}
                </div>
                <div className={styles.convBottom}>
                  <span className={styles.convPreview}>{lastText}</span>
                  {conv.unread_count > 0 && (
                    <span className={styles.unreadBadge}>{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.userBar}>
        <Avatar user={user} size={36} showOnline />
        <div className={styles.userBarInfo}>
          <span className={styles.userBarName}>{user?.display_name}</span>
          <span className={styles.userBarUsername}>@{user?.username}</span>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Выйти"><LogOut size={16} /></button>
      </div>
    </div>
  );
};

export default Sidebar;
