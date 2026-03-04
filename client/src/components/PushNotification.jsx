import React, { useEffect, useState, useRef } from 'react';
import { getSocket } from '../utils/socket';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import styles from './PushNotification.module.css';

// Один тост-уведомление
const NotifToast = ({ notif, onClose, onClick }) => {
  const initials = notif.senderName?.slice(0, 2).toUpperCase() || '?';

  return (
    <div
      className={styles.toast}
      style={{ '--avatar-color': notif.avatarColor || '#4f9cf9' }}
      onClick={() => { onClick(notif); onClose(); }}
    >
      <div className={styles.avatar}>{initials}</div>
      <div className={styles.content}>
        <div className={styles.title}>{notif.title}</div>
        <div className={styles.body}>{notif.body}</div>
      </div>
      <button className={styles.close} onClick={e => { e.stopPropagation(); onClose(); }}>✕</button>
    </div>
  );
};

const PushNotification = () => {
  const { user } = useAuthStore();
  const { activeConversationId, setActiveConversation, conversations } = useChatStore();
  const [queue, setQueue] = useState([]);
  const timerRefs = useRef({});

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Присоединяемся к личной комнате
    socket.emit('user:join_room');

    const onPush = (data) => {
      // Не показываем если чат уже открыт
      if (data.conversationId === activeConversationId) return;

      const id = Date.now();
      const notif = { ...data, id };

      setQueue(prev => [...prev.slice(-2), notif]); // максимум 3 одновременно

      // Автозакрытие через 4 секунды
      timerRefs.current[id] = setTimeout(() => {
        setQueue(prev => prev.filter(n => n.id !== id));
        delete timerRefs.current[id];
      }, 4000);

      // Системное уведомление браузера (если разрешено)
      if (Notification.permission === 'granted') {
        const sysNotif = new Notification(data.title, {
          body: data.body,
          icon: '/favicon.svg',
          tag: data.conversationId,
          silent: false,
        });
        sysNotif.onclick = () => {
          window.focus();
          setActiveConversation(data.conversationId);
          sysNotif.close();
        };
      }
    };

    socket.on('push:notification', onPush);
    return () => {
      socket.off('push:notification', onPush);
      Object.values(timerRefs.current).forEach(clearTimeout);
    };
  }, [activeConversationId]);

  const dismiss = (id) => {
    clearTimeout(timerRefs.current[id]);
    delete timerRefs.current[id];
    setQueue(prev => prev.filter(n => n.id !== id));
  };

  const open = (notif) => {
    setActiveConversation(notif.conversationId);
  };

  if (queue.length === 0) return null;

  return (
    <div className={styles.container}>
      {queue.map(n => (
        <NotifToast
          key={n.id}
          notif={n}
          onClose={() => dismiss(n.id)}
          onClick={open}
        />
      ))}
    </div>
  );
};

export default PushNotification;
