import React, { useEffect, useState, useRef } from 'react';
import { UserPlus, UserX, X, Check, Clock, Search, Users, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import Avatar from './Avatar';
import api from '../utils/api';
import styles from './FriendsPanel.module.css';

const FriendsPanel = ({ onClose, onOpenChat }) => {
  const { user } = useAuthStore();
  const { friends, friendRequests, fetchFriends, fetchFriendRequests, addConversation, setActiveConversation } = useChatStore();
  const [tab, setTab] = useState('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  // Для создания группы
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const searchTimeout = useRef(null);

  useEffect(() => { fetchFriends(); fetchFriendRequests(); }, []);

  const handleSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    // ✅ ОПТ-3: debounce 300ms
    searchTimeout.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(data);
      } catch {}
    }, 300);
  };

  const sendRequest = async (userId) => {
    try {
      await api.post(`/friends/request/${userId}`);
      toast.success('Запрос отправлен!');
      setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, friendRequest: { sender_id: user.id } } : u));
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  const acceptRequest = async (requestId) => {
    try { await api.post(`/friends/accept/${requestId}`); toast.success('Запрос принят!'); fetchFriends(); fetchFriendRequests(); }
    catch { toast.error('Ошибка'); }
  };

  const declineRequest = async (requestId) => {
    try { await api.post(`/friends/decline/${requestId}`); fetchFriendRequests(); }
    catch { toast.error('Ошибка'); }
  };

  const removeFriend = async (friendId) => {
    if (!confirm('Удалить из друзей?')) return;
    try { await api.delete(`/friends/${friendId}`); fetchFriends(); toast.success('Удалён из друзей'); }
    catch { toast.error('Ошибка'); }
  };

  const toggleMember = (id) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const createGroup = async () => {
    if (!groupName.trim()) { toast.error('Введите название группы'); return; }
    if (selectedMembers.length < 1) { toast.error('Выберите хотя бы одного участника'); return; }
    setCreatingGroup(true);
    try {
      const { data } = await api.post('/conversations/group', { name: groupName, memberIds: selectedMembers });
      addConversation(data);
      onOpenChat?.(null, data.id); // передаём готовый id
      // Просто открываем чат
      setActiveConversation(data.id);
      onClose();
      toast.success(`Группа "${groupName}" создана!`);
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setCreatingGroup(false); }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Друзья</h2>
        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
      </div>

      <div className={styles.tabs}>
        {[
          { id: 'friends', label: 'Друзья', count: friends.length },
          { id: 'requests', label: 'Запросы', count: friendRequests.length, alert: true },
          { id: 'add', label: 'Найти' },
          { id: 'group', label: 'Группа' }
        ].map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count > 0 && <span className={`${styles.count} ${t.alert ? styles.countAlert : ''}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {/* Friends */}
        {tab === 'friends' && (friends.length === 0
          ? <div className={styles.empty}><UserPlus size={36} className={styles.emptyIcon} /><p>Нет друзей</p></div>
          : friends.map(f => (
            <div key={f.id} className={styles.friendItem}>
              <Avatar user={f} size={44} showOnline />
              <div className={styles.info}>
                <span className={styles.name}>{f.display_name}</span>
                <span className={styles.sub}>{f.is_online ? '🟢 В сети' : `@${f.username}`}</span>
              </div>
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={() => { onOpenChat(f.id); onClose(); }} title="Написать">💬</button>
                <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => removeFriend(f.id)} title="Удалить"><UserX size={14} /></button>
              </div>
            </div>
          ))
        )}

        {/* Requests */}
        {tab === 'requests' && (friendRequests.length === 0
          ? <div className={styles.empty}><Clock size={36} className={styles.emptyIcon} /><p>Нет запросов</p></div>
          : friendRequests.map(req => (
            <div key={req.id} className={styles.friendItem}>
              <Avatar user={{ display_name: req.display_name, avatar_color: req.avatar_color }} size={44} />
              <div className={styles.info}>
                <span className={styles.name}>{req.display_name}</span>
                <span className={styles.sub}>@{req.username}</span>
              </div>
              <div className={styles.actions}>
                <button className={`${styles.actionBtn} ${styles.accept}`} onClick={() => acceptRequest(req.id)} title="Принять"><Check size={14} /></button>
                <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => declineRequest(req.id)} title="Отклонить"><X size={14} /></button>
              </div>
            </div>
          ))
        )}

        {/* Add friends */}
        {tab === 'add' && (
          <>
            <div className={styles.searchWrap}>
              <Search size={15} className={styles.searchIcon} />
              <input className={styles.searchInput} placeholder="Поиск по имени..." value={searchQuery} onChange={e => handleSearch(e.target.value)} autoFocus />
            </div>
            {searchQuery.length < 2
              ? <div className={styles.empty}><p>Введите 2+ символа</p></div>
              : searchResults.length === 0
                ? <div className={styles.empty}><p>Никого не найдено</p></div>
                : searchResults.map(u => (
                  <div key={u.id} className={styles.friendItem}>
                    <Avatar user={u} size={44} showOnline />
                    <div className={styles.info}>
                      <span className={styles.name}>{u.display_name}</span>
                      <span className={styles.sub}>@{u.username}</span>
                    </div>
                    <div className={styles.actions}>
                      {u.isFriend ? <span className={styles.badge}>Друг</span>
                        : u.friendRequest ? <span className={styles.badge}>Отправлено</span>
                        : <button className={`${styles.actionBtn} ${styles.add}`} onClick={() => sendRequest(u.id)} title="Добавить"><UserPlus size={14} /></button>
                      }
                    </div>
                  </div>
                ))
            }
          </>
        )}

        {/* Create group */}
        {tab === 'group' && (
          <div className={styles.groupCreate}>
            <p className={styles.groupHint}>Введите название и выберите участников из друзей</p>
            <input
              className={styles.groupNameInput}
              placeholder="Название группы..."
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              maxLength={64}
            />
            <p className={styles.sectionLabel}>Выберите участников</p>
            {friends.length === 0
              ? <div className={styles.empty}><p>Сначала добавьте друзей</p></div>
              : friends.map(f => {
                const selected = selectedMembers.includes(f.id);
                return (
                  <button key={f.id} className={`${styles.memberItem} ${selected ? styles.memberSelected : ''}`} onClick={() => toggleMember(f.id)}>
                    <Avatar user={f} size={38} showOnline />
                    <div className={styles.info}>
                      <span className={styles.name}>{f.display_name}</span>
                      <span className={styles.sub}>@{f.username}</span>
                    </div>
                    <div className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`}>
                      {selected && <Check size={12} />}
                    </div>
                  </button>
                );
              })
            }
            {selectedMembers.length > 0 && (
              <div className={styles.groupFooter}>
                <span className={styles.selectedCount}>Выбрано: {selectedMembers.length}</span>
                <button className={styles.createBtn} onClick={createGroup} disabled={creatingGroup}>
                  {creatingGroup ? '...' : <><Plus size={14} /> Создать группу</>}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendsPanel;
