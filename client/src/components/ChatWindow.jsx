import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Reply, Edit2, Trash2, X, ChevronDown, ArrowLeft, Smile, Image, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import { getSocket } from '../utils/socket';
import { formatMessageTime, formatMessageDate, formatLastSeen } from '../utils/format';
import Avatar from './Avatar';
import EmojiPicker from './EmojiPicker';
import VoiceRecorder from './VoiceRecorder';
import VoiceMessage from './VoiceMessage';
import UserProfile from './UserProfile';
import MessageReactions from './MessageReactions';
import api from '../utils/api';
import styles from './ChatWindow.module.css';

const ChatWindow = ({ conversationId, onBack }) => {
  const { user } = useAuthStore();
  const { messages, conversations, fetchMessages, setActiveConversation, addConversation, typingUsers } = useChatStore();

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);
  const [reactions, setReactions] = useState({});

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const longPressTimer = useRef(null);

  const conversation = conversations.find(c => c.id === conversationId);
  const msgs = messages[conversationId] || [];
  const typing = typingUsers[conversationId] || {};
  const typingNames = Object.values(typing).filter(n => n !== user?.username);

  useEffect(() => {
    if (!conversationId) return;
    fetchMessages(conversationId).then(data => {
      setHasMore(data.length >= 50);
      setTimeout(() => scrollToBottom(false), 50);
    });
    setText(''); setReplyTo(null); setEditingMsg(null); setShowEmoji(false);
    setReactions({});

    const socket = getSocket();
    const onReactionsUpdate = ({ messageId, reactions: r }) => {
      setReactions(prev => ({ ...prev, [messageId]: r }));
    };
    socket?.on('message:reactions_update', onReactionsUpdate);
    return () => socket?.off('message:reactions_update', onReactionsUpdate);
  }, [conversationId]);

  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (msgs.length > prevMsgCount.current && isAtBottom) scrollToBottom(false);
    prevMsgCount.current = msgs.length;
  }, [msgs.length, isAtBottom]);

  const scrollToBottom = (smooth = true) =>
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
    if (el.scrollTop < 100 && hasMore && !loadingMore) loadOlderMessages();
  };

  const loadOlderMessages = async () => {
    setLoadingMore(true);
    const savedH = listRef.current?.scrollHeight;
    try {
      const data = await fetchMessages(conversationId, msgs[0]?.created_at);
      if (data.length < 50) setHasMore(false);
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - savedH; });
    } finally { setLoadingMore(false); }
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (!socket) return;
    if (!isTypingRef.current) { isTypingRef.current = true; socket.emit('typing:start', { conversationId }); }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false; socket.emit('typing:stop', { conversationId });
    }, 2000);
  };

  const emitMessage = useCallback((content, messageType = 'text', overrideReply = undefined) => {
    const socket = getSocket();
    if (!socket?.connected) { toast.error('Нет соединения'); return; }
    clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    socket.emit('typing:stop', { conversationId });

    const replyId = overrideReply !== undefined ? overrideReply : replyTo?.id || null;

    if (messageType === 'text' && editingMsg) {
      socket.emit('message:edit', { conversationId, messageId: editingMsg.id, content }, res => { if (res.error) toast.error(res.error); });
      setEditingMsg(null);
    } else {
      socket.emit('message:send', { conversationId, content, messageType, replyToId: replyId }, res => { if (res.error) toast.error(res.error); });
      setReplyTo(null);
    }
    setText('');
  }, [text, conversationId, replyTo, editingMsg]);

  const sendText = () => { if (text.trim()) emitMessage(text.trim(), 'text'); };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    if (e.key === 'Escape') { setReplyTo(null); setEditingMsg(null); setText(''); setShowEmoji(false); }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Максимум 5 МБ'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Только изображения'); return; }
    setImageUploading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      emitMessage(base64, 'image');
    } catch { toast.error('Ошибка загрузки'); }
    finally { setImageUploading(false); e.target.value = ''; }
  };

  const handleVoiceSend = (audioData, duration) => {
    // Сохраняем duration как JSON в начале строки для отображения
    const payload = JSON.stringify({ data: audioData, duration });
    emitMessage(payload, 'voice');
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 170), y: Math.min(e.clientY, window.innerHeight - 130), msg });
  };

  const handleTouchStart = (e, msg) => {
    if (msg.is_deleted) return;
    longPressTimer.current = setTimeout(() => {
      const touch = e.touches[0];
      setContextMenu({ x: Math.min(touch.clientX, window.innerWidth - 170), y: Math.min(touch.clientY, window.innerHeight - 130), msg });
    }, 500);
  };
  const handleTouchEnd = () => clearTimeout(longPressTimer.current);

  useEffect(() => {
    const close = () => { setContextMenu(null); setShowEmoji(false); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleProfileOpen = (userId) => {
    if (userId === user?.id) return;
    setViewProfileId(userId);
  };

  const handleProfileOpenChat = async (convData) => {
    addConversation(convData);
    setActiveConversation(convData.id);
  };

  if (!conversation) return null;

  const otherUser = conversation.other_user;
  const isGroup = conversation.type === 'group';
  const headerName = isGroup ? (conversation.name || 'Групповой чат') : (otherUser?.display_name || otherUser?.username);

  const grouped = [];
  msgs.forEach((msg, i) => {
    const prev = msgs[i - 1];
    const dateLabel = formatMessageDate(msg.created_at);
    if (!prev || formatMessageDate(prev.created_at) !== dateLabel) {
      grouped.push({ type: 'date', label: dateLabel, key: `date-${msg.id}` });
    }
    const showAvatar = !prev || prev.sender_id !== msg.sender_id || msg.created_at - prev.created_at > 5 * 60 * 1000;
    grouped.push({ type: 'message', msg, showAvatar, key: msg.id });
  });

  const renderMsgContent = (msg, isMine) => {
    if (msg.is_deleted) return <p className={styles.msgText}>Сообщение удалено</p>;
    if (msg.message_type === 'image') {
      return <img src={msg.content} alt="изображение" className={styles.msgImage} onClick={() => window.open(msg.content, '_blank')} />;
    }
    if (msg.message_type === 'voice') {
      try {
        const { data, duration } = JSON.parse(msg.content);
        return <VoiceMessage src={data} duration={duration} isMine={isMine} />;
      } catch { return <p className={styles.msgText}>🎤 Голосовое сообщение</p>; }
    }
    return <p className={styles.msgText}>{msg.content}</p>;
  };

  return (
    <div className={styles.window}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}><ArrowLeft size={20} /></button>
        <div
          className={styles.headerAvatar}
          onClick={() => !isGroup && otherUser && handleProfileOpen(otherUser.id)}
          style={{ cursor: !isGroup ? 'pointer' : 'default' }}
        >
          {isGroup
            ? <div className={styles.groupAvatar}><Users size={20} /></div>
            : <Avatar user={otherUser} size={38} showOnline />
          }
        </div>
        <div
          className={styles.headerInfo}
          onClick={() => !isGroup && otherUser && handleProfileOpen(otherUser.id)}
          style={{ cursor: !isGroup ? 'pointer' : 'default' }}
        >
          <span className={styles.headerName}>{headerName}</span>
          <span className={styles.headerStatus}>
            {isGroup
              ? `${conversation.member_count || '?'} участников`
              : formatLastSeen(otherUser?.last_seen, otherUser?.is_online)
            }
          </span>
        </div>
      </div>

      <div className={styles.messages} ref={listRef} onScroll={handleScroll}>
        {loadingMore && <div className={styles.loadingMore}>Загрузка...</div>}

        {grouped.map(item => {
          if (item.type === 'date') return (
            <div key={item.key} className={styles.dateDivider}><span>{item.label}</span></div>
          );
          const { msg, showAvatar } = item;
          const isMine = msg.sender_id === user?.id;

          return (
            <div
              key={msg.id}
              className={`${styles.msgRow} ${isMine ? styles.msgRowMine : ''} message-in msgRow`}
              onContextMenu={e => !msg.is_deleted && handleContextMenu(e, msg)}
              onTouchStart={e => handleTouchStart(e, msg)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
            >
              {!isMine && (
                <div
                  className={styles.msgAvatar}
                  onClick={() => handleProfileOpen(msg.sender_id)}
                  style={{ cursor: 'pointer' }}
                >
                  {showAvatar
                    ? <Avatar user={{ display_name: msg.display_name, avatar_color: msg.avatar_color }} size={32} />
                    : <div style={{ width: 32 }} />
                  }
                </div>
              )}
              <div className={`${styles.msgContent} ${isMine ? styles.msgContentMine : ''}`}>
                {!isMine && showAvatar && (
                  <span
                    className={styles.msgSender}
                    onClick={() => handleProfileOpen(msg.sender_id)}
                    style={{ cursor: 'pointer' }}
                  >{msg.display_name}</span>
                )}
                {msg.reply_to && (
                  <div className={styles.replyBar}>
                    <span className={styles.replyName}>Ответ</span>
                    <span className={styles.replyText}>
                      {msg.reply_to.message_type === 'image' ? '🖼 Изображение'
                        : msg.reply_to.message_type === 'voice' ? '🎤 Голосовое'
                        : msg.reply_to.is_deleted ? 'Сообщение удалено'
                        : msg.reply_to.content}
                    </span>
                  </div>
                )}
                <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : ''} ${msg.is_deleted ? styles.bubbleDeleted : ''}`}>
                  {renderMsgContent(msg, isMine)}
                  {msg.message_type !== 'voice' && (
                    <div className={styles.msgMeta}>
                      <span className={styles.msgTime}>{formatMessageTime(msg.created_at)}</span>
                      {msg.is_edited === 1 && !msg.is_deleted && <span className={styles.editedMark}>изм.</span>}
                    </div>
                  )}
                </div>
                {!msg.is_deleted && (
                  <MessageReactions
                    messageId={msg.id}
                    conversationId={conversationId}
                    reactions={reactions[msg.id] || {}}
                    isMine={isMine}
                  />
                )}
              </div>
            </div>
          );
        })}

        {typingNames.length > 0 && (
          <div className={styles.typingIndicator}>
            <div className={styles.typingDots}><span /><span /><span /></div>
            <span>{typingNames.join(', ')} печатает...</span>
          </div>
        )}
      </div>

      {!isAtBottom && (
        <button className={styles.scrollBtn} onClick={() => scrollToBottom()}><ChevronDown size={18} /></button>
      )}

      {(replyTo || editingMsg) && (
        <div className={styles.replyEditBar}>
          <div className={styles.replyEditInfo}>
            <span className={styles.replyEditLabel}>{editingMsg ? '✏️ Редактирование' : '↩️ Ответить'}</span>
            <span className={styles.replyEditText}>
              {(editingMsg || replyTo)?.message_type === 'image' ? '🖼 Изображение'
               : (editingMsg || replyTo)?.message_type === 'voice' ? '🎤 Голосовое'
               : (editingMsg || replyTo)?.content}
            </span>
          </div>
          <button className={styles.replyEditClose} onClick={() => { setReplyTo(null); setEditingMsg(null); if (editingMsg) setText(''); }}><X size={16} /></button>
        </div>
      )}

      <div className={styles.inputArea}>
        {showEmoji && (
          <div className={styles.emojiPickerWrap} onClick={e => e.stopPropagation()}>
            <EmojiPicker onSelect={emoji => { setText(t => t + emoji); inputRef.current?.focus(); }} />
          </div>
        )}
        <div className={styles.inputRow}>
          <button
            className={`${styles.toolBtn} ${showEmoji ? styles.toolBtnActive : ''}`}
            onClick={e => { e.stopPropagation(); setShowEmoji(v => !v); }}
            title="Смайлики"
          ><Smile size={20} /></button>

          <button className={styles.toolBtn} onClick={() => fileInputRef.current?.click()} disabled={imageUploading} title="Фото">
            {imageUploading ? <span className={styles.spinnerSm} /> : <Image size={20} />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />

          <textarea
            ref={inputRef}
            className={styles.input}
            value={text}
            onChange={e => { setText(e.target.value); handleTyping(); }}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..."
            rows={1}
          />

          {text.trim()
            ? <button className={`${styles.sendBtn} ${styles.sendBtnActive}`} onClick={sendText}><Send size={18} /></button>
            : <VoiceRecorder onSend={handleVoiceSend} />
          }
        </div>
      </div>

      {contextMenu && (
        <div className={styles.contextMenu} style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }}>
            <Reply size={14} /> Ответить
          </button>
          {contextMenu.msg.sender_id === user?.id && contextMenu.msg.message_type === 'text' && (
            <button onClick={() => { setEditingMsg(contextMenu.msg); setText(contextMenu.msg.content); setContextMenu(null); inputRef.current?.focus(); }}>
              <Edit2 size={14} /> Изменить
            </button>
          )}
          {contextMenu.msg.sender_id !== user?.id && (
            <button onClick={() => { handleProfileOpen(contextMenu.msg.sender_id); setContextMenu(null); }}>
              👤 Профиль
            </button>
          )}
          {contextMenu.msg.sender_id === user?.id && (
            <button className={styles.danger} onClick={() => {
              getSocket()?.emit('message:delete', { conversationId, messageId: contextMenu.msg.id }, res => { if (res?.error) toast.error(res.error); });
              setContextMenu(null);
            }}><Trash2 size={14} /> Удалить</button>
          )}
        </div>
      )}

      {viewProfileId && (
        <UserProfile
          userId={viewProfileId}
          onClose={() => setViewProfileId(null)}
          onOpenChat={handleProfileOpenChat}
        />
      )}
    </div>
  );
};

export default ChatWindow;
