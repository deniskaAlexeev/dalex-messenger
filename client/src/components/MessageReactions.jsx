import React, { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';
import { getSocket } from '../utils/socket';
import useAuthStore from '../hooks/useAuthStore';
import styles from './MessageReactions.module.css';

const QUICK = ['❤️', '😂', '👍', '🔥', '😮', '😢', '👏', '🎉'];

const MessageReactions = ({ messageId, conversationId, reactions = {}, isMine }) => {
  const { user } = useAuthStore();
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowPicker(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const react = (emoji) => {
    getSocket()?.emit('message:react', { conversationId, messageId, emoji });
    setShowPicker(false);
  };

  const hasAny = Object.keys(reactions).length > 0;

  return (
    <div className={`${styles.wrap} ${isMine ? styles.wrapMine : ''}`}>
      {/* Существующие реакции */}
      {Object.entries(reactions).map(([emoji, userIds]) => {
        const mine = userIds.includes(user?.id);
        return (
          <button
            key={emoji}
            className={`${styles.badge} ${mine ? styles.badgeMine : ''}`}
            onClick={() => react(emoji)}
            title={`${userIds.length}`}
          >
            <span>{emoji}</span>
            <span className={styles.cnt}>{userIds.length}</span>
          </button>
        );
      })}

      {/* Кнопка + реакция */}
      <div className={styles.addWrap} ref={ref}>
        <button
          className={`${styles.addBtn} ${showPicker ? styles.addBtnActive : ''} ${!hasAny ? styles.addBtnHidden : ''}`}
          onClick={() => setShowPicker(v => !v)}
          title="Добавить реакцию"
        >
          <Smile size={12} />
        </button>
        {showPicker && (
          <div className={`${styles.picker} pop-in`}>
            {QUICK.map(e => (
              <button key={e} className={styles.pickerEmoji} onClick={() => react(e)}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageReactions;
