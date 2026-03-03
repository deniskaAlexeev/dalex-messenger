import React, { useState, useEffect } from 'react';
import { X, MessageSquare, UserPlus, UserCheck, UserX, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import Avatar from './Avatar';
import { formatLastSeen } from '../utils/format';
import api from '../utils/api';
import styles from './UserProfile.module.css';

const UserProfile = ({ userId, onClose, onOpenChat }) => {
  const { user: me } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState(null); // null | 'friend' | 'sent' | 'incoming'

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      api.get(`/users/${userId}`),
      api.get('/friends'),
      api.get('/friends/requests'),
      api.get('/friends/requests/sent')
    ]).then(([profileRes, friendsRes, incomingRes, sentRes]) => {
      setProfile(profileRes.data);
      const isFriend = friendsRes.data.some(f => f.id === userId);
      const hasIncoming = incomingRes.data.some(r => r.sender_id === userId);
      const hasSent = sentRes.data.some(r => r.receiver_id === userId);
      if (isFriend) setFriendStatus('friend');
      else if (hasIncoming) setFriendStatus('incoming');
      else if (hasSent) setFriendStatus('sent');
      else setFriendStatus(null);
    }).catch(() => toast.error('Не удалось загрузить профиль'))
      .finally(() => setLoading(false));
  }, [userId]);

  const sendRequest = async () => {
    try {
      await api.post(`/friends/request/${userId}`);
      setFriendStatus('sent');
      toast.success('Запрос отправлен!');
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  const removeFriend = async () => {
    if (!confirm('Удалить из друзей?')) return;
    try {
      await api.delete(`/friends/${userId}`);
      setFriendStatus(null);
      toast.success('Удалён из друзей');
    } catch { toast.error('Ошибка'); }
  };

  const handleMessage = async () => {
    try {
      const { data } = await api.post(`/conversations/direct/${userId}`);
      onOpenChat?.(data);
      onClose();
    } catch { toast.error('Ошибка'); }
  };

  if (loading) return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.loadingWrap}><span className={styles.spinner} /></div>
      </div>
    </div>
  );

  if (!profile) return null;
  const isMe = profile.id === me?.id;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>

        <div className={styles.avatarWrap}>
          <Avatar user={profile} size={84} showOnline />
        </div>

        <div className={styles.nameWrap}>
          <h2 className={styles.displayName}>{profile.display_name}</h2>
          <span className={styles.username}>@{profile.username}</span>
        </div>

        <div className={styles.statusRow}>
          <span className={`${styles.onlineStatus} ${profile.is_online ? styles.online : ''}`}>
            {formatLastSeen(profile.last_seen, profile.is_online)}
          </span>
        </div>

        {profile.bio && (
          <div className={styles.bio}>
            <p>{profile.bio}</p>
          </div>
        )}

        {!isMe && (
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={handleMessage}>
              <MessageSquare size={16} /> Написать
            </button>

            {friendStatus === 'friend' && (
              <button className={`${styles.btnSecondary} ${styles.btnDanger}`} onClick={removeFriend}>
                <UserX size={16} /> Удалить из друзей
              </button>
            )}
            {friendStatus === 'sent' && (
              <button className={styles.btnSecondary} disabled>
                <Clock size={16} /> Запрос отправлен
              </button>
            )}
            {friendStatus === 'incoming' && (
              <button className={styles.btnSecondary} onClick={sendRequest}>
                <UserCheck size={16} /> Принять запрос
              </button>
            )}
            {friendStatus === null && (
              <button className={styles.btnSecondary} onClick={sendRequest}>
                <UserPlus size={16} /> Добавить в друзья
              </button>
            )}
          </div>
        )}

        {isMe && (
          <div className={styles.meLabel}>Это ваш профиль</div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
