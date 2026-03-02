import React, { useEffect, useState } from 'react';
import { UserPlus, UserCheck, UserX, X, Check, Clock, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import Avatar from './Avatar';
import api from '../utils/api';
import styles from './FriendsPanel.module.css';

const FriendsPanel = ({ onClose, onOpenChat }) => {
  const { user } = useAuthStore();
  const { friends, friendRequests, fetchFriends, fetchFriendRequests } = useChatStore();
  const [tab, setTab] = useState('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    fetchFriends();
    fetchFriendRequests();
  }, []);

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data);
    } catch {}
  };

  const sendRequest = async (userId) => {
    try {
      await api.post(`/friends/request/${userId}`);
      toast.success('Запрос отправлен!');
      setSearchResults(prev => prev.map(u =>
        u.id === userId ? { ...u, friendRequest: { sender_id: user.id } } : u
      ));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const acceptRequest = async (requestId) => {
    try {
      await api.post(`/friends/accept/${requestId}`);
      toast.success('Запрос принят!');
      fetchFriends();
      fetchFriendRequests();
    } catch {
      toast.error('Ошибка');
    }
  };

  const declineRequest = async (requestId) => {
    try {
      await api.post(`/friends/decline/${requestId}`);
      fetchFriendRequests();
    } catch {
      toast.error('Ошибка');
    }
  };

  const removeFriend = async (friendId) => {
    if (!confirm('Удалить из друзей?')) return;
    try {
      await api.delete(`/friends/${friendId}`);
      fetchFriends();
      toast.success('Удалён из друзей');
    } catch {
      toast.error('Ошибка');
    }
  };

  const filteredFriends = friends.filter(f =>
    f.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Друзья</h2>
        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'friends' ? styles.tabActive : ''}`}
          onClick={() => setTab('friends')}
        >
          Все друзья
          {friends.length > 0 && <span className={styles.count}>{friends.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${tab === 'requests' ? styles.tabActive : ''}`}
          onClick={() => setTab('requests')}
        >
          Запросы
          {friendRequests.length > 0 && (
            <span className={`${styles.count} ${styles.countAlert}`}>{friendRequests.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${tab === 'add' ? styles.tabActive : ''}`}
          onClick={() => setTab('add')}
        >
          Добавить
        </button>
      </div>

      <div className={styles.content}>
        {/* Friends list */}
        {tab === 'friends' && (
          <>
            {friends.length === 0 ? (
              <div className={styles.empty}>
                <UserPlus size={40} className={styles.emptyIcon} />
                <p>Нет друзей</p>
                <p className={styles.emptySub}>Найдите новых друзей во вкладке «Добавить»</p>
              </div>
            ) : (
              filteredFriends.map(f => (
                <div key={f.id} className={styles.friendItem}>
                  <Avatar user={f} size={44} showOnline />
                  <div className={styles.info}>
                    <span className={styles.name}>{f.display_name}</span>
                    <span className={styles.sub}>
                      {f.is_online ? '🟢 В сети' : `@${f.username}`}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => onOpenChat(f.id)}
                      title="Написать"
                    >
                      💬
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.danger}`}
                      onClick={() => removeFriend(f.id)}
                      title="Удалить"
                    >
                      <UserX size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Requests */}
        {tab === 'requests' && (
          <>
            {friendRequests.length === 0 ? (
              <div className={styles.empty}>
                <Clock size={40} className={styles.emptyIcon} />
                <p>Нет входящих запросов</p>
              </div>
            ) : (
              friendRequests.map(req => (
                <div key={req.id} className={styles.friendItem}>
                  <Avatar user={{ display_name: req.display_name, avatar_color: req.avatar_color }} size={44} />
                  <div className={styles.info}>
                    <span className={styles.name}>{req.display_name}</span>
                    <span className={styles.sub}>@{req.username}</span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={`${styles.actionBtn} ${styles.accept}`}
                      onClick={() => acceptRequest(req.id)}
                      title="Принять"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.danger}`}
                      onClick={() => declineRequest(req.id)}
                      title="Отклонить"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Add friends */}
        {tab === 'add' && (
          <>
            <div className={styles.searchWrap}>
              <Search size={15} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Поиск по имени или @username..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                autoFocus
              />
            </div>
            {searchQuery.length < 2 ? (
              <div className={styles.empty}>
                <p>Введите 2 или более символов для поиска</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className={styles.empty}><p>Никого не найдено</p></div>
            ) : (
              searchResults.map(u => (
                <div key={u.id} className={styles.friendItem}>
                  <Avatar user={u} size={44} showOnline />
                  <div className={styles.info}>
                    <span className={styles.name}>{u.display_name}</span>
                    <span className={styles.sub}>@{u.username}</span>
                  </div>
                  <div className={styles.actions}>
                    {u.isFriend ? (
                      <span className={styles.badge}>Друг</span>
                    ) : u.friendRequest ? (
                      <span className={styles.badge}>Отправлено</span>
                    ) : (
                      <button
                        className={`${styles.actionBtn} ${styles.add}`}
                        onClick={() => sendRequest(u.id)}
                        title="Добавить"
                      >
                        <UserPlus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FriendsPanel;
