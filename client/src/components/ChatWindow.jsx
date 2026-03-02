import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Reply, Edit2, Trash2, X, MoreHorizontal, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import useChatStore from '../hooks/useChatStore';
import { getSocket } from '../utils/socket';
import { formatMessageTime, formatMessageDate } from '../utils/format';
import Avatar from './Avatar';
import api from '../utils/api';
import styles from './ChatWindow.module.css';

const ChatWindow = ({ conversationId }) => {
  const { user } = useAuthStore();
  const { messages, conversations, fetchMessages, setActiveConversation, typingUsers } = useChatStore();

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const conversation = conversations.find(c => c.id === conversationId);
  const msgs = messages[conversationId] || [];
  const typing = typingUsers[conversationId] || {};
  const typingNames = Object.values(typing).filter(n => n !== user?.username);

  // Initial load
  useEffect(() => {
    if (!conversationId) return;
    fetchMessages(conversationId).then(data => {
      setHasMore(data.length >= 50);
      setTimeout(() => scrollToBottom(false), 50);
    });
    return () => {
      setText('');
      setReplyTo(null);
      setEditingMsg(null);
    };
  }, [conversationId]);

  // Auto-scroll on new messages
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (msgs.length > prevMsgCount.current && isAtBottom) {
      scrollToBottom(false);
    }
    prevMsgCount.current = msgs.length;
  }, [msgs.length, isAtBottom]);

  const scrollToBottom = (smooth = true) => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(bottom < 60);

    // Load more on scroll to top
    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      loadOlderMessages();
    }
  };

  const loadOlderMessages = async () => {
    setLoadingMore(true);
    const firstMsg = msgs[0];
    const savedScrollHeight = listRef.current?.scrollHeight;
    try {
      const data = await fetchMessages(conversationId, firstMsg?.created_at);
      if (data.length < 50) setHasMore(false);
      // Preserve scroll position
      requestAnimationFrame(() => {
        if (listRef.current) {
          const newScrollHeight = listRef.current.scrollHeight;
          listRef.current.scrollTop = newScrollHeight - savedScrollHeight;
        }
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (!socket) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing:start', { conversationId });
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('typing:stop', { conversationId });
    }, 2000);
  };

  const sendMessage = useCallback(() => {
    const content = text.trim();
    if (!content) return;

    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('Нет соединения');
      return;
    }

    // Stop typing
    clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    socket.emit('typing:stop', { conversationId });

    if (editingMsg) {
      socket.emit('message:edit', {
        conversationId,
        messageId: editingMsg.id,
        content
      }, (res) => {
        if (res.error) toast.error(res.error);
      });
      setEditingMsg(null);
    } else {
      socket.emit('message:send', {
        conversationId,
        content,
        replyToId: replyTo?.id || null
      }, (res) => {
        if (res.error) toast.error(res.error);
      });
      setReplyTo(null);
    }

    setText('');
  }, [text, conversationId, replyTo, editingMsg]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape') {
      setReplyTo(null);
      setEditingMsg(null);
      setText('');
    }
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  };

  const handleDeleteMessage = (msgId) => {
    const socket = getSocket();
    socket?.emit('message:delete', { conversationId, messageId: msgId }, (res) => {
      if (res?.error) toast.error(res.error);
    });
    setContextMenu(null);
  };

  const handleEditStart = (msg) => {
    setEditingMsg(msg);
    setText(msg.content);
    setContextMenu(null);
    inputRef.current?.focus();
  };

  const handleReply = (msg) => {
    setReplyTo(msg);
    setContextMenu(null);
    setEditingMsg(null);
    inputRef.current?.focus();
  };

  // Close context menu on click outside
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  if (!conversation) return null;

  const otherUser = conversation.other_user;

  // Group messages by date and merge consecutive from same user
  const grouped = [];
  msgs.forEach((msg, i) => {
    const prev = msgs[i - 1];
    const dateLabel = formatMessageDate(msg.created_at);
    const prevLabel = prev ? formatMessageDate(prev.created_at) : null;

    if (dateLabel !== prevLabel) {
      grouped.push({ type: 'date', label: dateLabel, key: `date-${msg.id}` });
    }

    const showAvatar = !prev || prev.sender_id !== msg.sender_id ||
      msg.created_at - prev.created_at > 5 * 60 * 1000;

    grouped.push({ type: 'message', msg, showAvatar, key: msg.id });
  });

  return (
    <div className={styles.window}>
      {/* Header */}
      <div className={styles.header}>
        {otherUser && (
          <>
            <Avatar user={otherUser} size={38} showOnline />
            <div className={styles.headerInfo}>
              <span className={styles.headerName}>{otherUser.display_name}</span>
              <span className={styles.headerStatus}>
                {otherUser.is_online
                  ? 'В сети'
                  : `@${otherUser.username}`
                }
              </span>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className={styles.messages} ref={listRef} onScroll={handleScroll}>
        {loadingMore && (
          <div className={styles.loadingMore}>Загрузка...</div>
        )}

        {grouped.map(item => {
          if (item.type === 'date') {
            return (
              <div key={item.key} className={styles.dateDivider}>
                <span>{item.label}</span>
              </div>
            );
          }

          const { msg, showAvatar } = item;
          const isMine = msg.sender_id === user?.id;

          return (
            <div
              key={msg.id}
              className={`${styles.msgRow} ${isMine ? styles.msgRowMine : ''} message-in`}
              onContextMenu={(e) => !msg.is_deleted && handleContextMenu(e, msg)}
            >
              {!isMine && (
                <div className={styles.msgAvatar}>
                  {showAvatar ? (
                    <Avatar user={{ display_name: msg.display_name, avatar_color: msg.avatar_color }} size={32} />
                  ) : (
                    <div style={{ width: 32 }} />
                  )}
                </div>
              )}

              <div className={`${styles.msgContent} ${isMine ? styles.msgContentMine : ''}`}>
                {!isMine && showAvatar && (
                  <span className={styles.msgSender}>{msg.display_name}</span>
                )}

                {msg.reply_to && (
                  <div className={styles.replyBar}>
                    <span className={styles.replyName}>Ответ</span>
                    <span className={styles.replyText}>
                      {msg.reply_to.is_deleted ? 'Сообщение удалено' : msg.reply_to.content}
                    </span>
                  </div>
                )}

                <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : ''} ${msg.is_deleted ? styles.bubbleDeleted : ''}`}>
                  <p className={styles.msgText}>{msg.content}</p>
                  <div className={styles.msgMeta}>
                    <span className={styles.msgTime}>{formatMessageTime(msg.created_at)}</span>
                    {msg.is_edited === 1 && !msg.is_deleted && (
                      <span className={styles.editedMark}>изм.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {typingNames.length > 0 && (
          <div className={styles.typingIndicator}>
            <div className={styles.typingDots}>
              <span /><span /><span />
            </div>
            <span>{typingNames.join(', ')} печатает...</span>
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button className={styles.scrollBtn} onClick={() => scrollToBottom()}>
          <ChevronDown size={18} />
        </button>
      )}

      {/* Reply / Edit bar */}
      {(replyTo || editingMsg) && (
        <div className={styles.replyEditBar}>
          <div className={styles.replyEditInfo}>
            <span className={styles.replyEditLabel}>
              {editingMsg ? '✏️ Редактирование' : '↩️ Ответить'}
            </span>
            <span className={styles.replyEditText}>
              {(editingMsg || replyTo)?.content}
            </span>
          </div>
          <button
            className={styles.replyEditClose}
            onClick={() => {
              setReplyTo(null);
              setEditingMsg(null);
              setText(editingMsg ? '' : text);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Input */}
      <div className={styles.inputWrap}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={text}
          onChange={e => { setText(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение..."
          rows={1}
          style={{ height: Math.min(120, Math.max(44, text.split('\n').length * 22 + 22)) }}
        />
        <button
          className={`${styles.sendBtn} ${text.trim() ? styles.sendBtnActive : ''}`}
          onClick={sendMessage}
          disabled={!text.trim()}
        >
          <Send size={18} />
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => handleReply(contextMenu.msg)}>
            <Reply size={14} /> Ответить
          </button>
          {contextMenu.msg.sender_id === user?.id && (
            <>
              <button onClick={() => handleEditStart(contextMenu.msg)}>
                <Edit2 size={14} /> Изменить
              </button>
              <button className={styles.danger} onClick={() => handleDeleteMessage(contextMenu.msg.id)}>
                <Trash2 size={14} /> Удалить
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
