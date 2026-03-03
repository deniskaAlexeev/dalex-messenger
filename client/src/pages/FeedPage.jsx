import React, { useState, useEffect, useRef } from 'react';
import { Send, Image, Trash2, MessageCircle, Heart, ArrowLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import Avatar from '../components/Avatar';
import UserProfile from '../components/UserProfile';
import { getSocket } from '../utils/socket';
import api from '../utils/api';
import { formatMessageDate, formatMessageTime } from '../utils/format';
import styles from './FeedPage.module.css';

const FeedPage = ({ onBack }) => {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState('');
  const [imageData, setImageData] = useState(null);
  const [posting, setPosting] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentsData, setCommentsData] = useState({});
  const [commentText, setCommentText] = useState({});
  const [viewProfileId, setViewProfileId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadPosts();
    const socket = getSocket();
    if (socket) {
      socket.on('feed:new_post', post => setPosts(prev => [post, ...prev]));
      socket.on('feed:like_update', ({ postId, likes_count }) => {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count } : p));
      });
      socket.on('feed:new_comment', ({ comment, comments_count }) => {
        setPosts(prev => prev.map(p => p.id === comment.post_id ? { ...p, comments_count } : p));
        setCommentsData(prev => ({
          ...prev,
          [comment.post_id]: [...(prev[comment.post_id] || []), comment]
        }));
      });
    }
    return () => {
      socket?.off('feed:new_post');
      socket?.off('feed:like_update');
      socket?.off('feed:new_comment');
    };
  }, []);

  const loadPosts = async (before = null) => {
    try {
      const params = { limit: 20 };
      if (before) params.before = before;
      const { data } = await api.get('/feed', { params });
      if (before) setPosts(prev => [...prev, ...data]);
      else setPosts(data);
      setHasMore(data.length >= 20);
    } catch (err) { toast.error('Ошибка загрузки ленты'); }
    finally { setLoading(false); }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Максимум 5 МБ'); return; }
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const submitPost = () => {
    if (!text.trim() && !imageData) { toast.error('Напишите что-нибудь или добавьте фото'); return; }
    setPosting(true);
    const socket = getSocket();
    socket?.emit('feed:post', { content: text, imageData }, res => {
      setPosting(false);
      if (res?.error) { toast.error(res.error); return; }
      setText(''); setImageData(null);
    });
  };

  const toggleLike = (postId) => {
    const socket = getSocket();
    socket?.emit('feed:like', { postId }, res => {
      if (res?.error) return;
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, liked_by_me: res.liked, likes_count: res.likes_count } : p
      ));
    });
  };

  const toggleComments = async (postId) => {
    const isOpen = expandedComments[postId];
    setExpandedComments(prev => ({ ...prev, [postId]: !isOpen }));
    if (!isOpen && !commentsData[postId]) {
      try {
        const { data } = await api.get(`/feed/${postId}/comments`);
        setCommentsData(prev => ({ ...prev, [postId]: data }));
      } catch {}
    }
  };

  const submitComment = (postId) => {
    const content = commentText[postId]?.trim();
    if (!content) return;
    const socket = getSocket();
    socket?.emit('feed:comment', { postId, content }, res => {
      if (res?.error) { toast.error(res.error); return; }
      setCommentText(prev => ({ ...prev, [postId]: '' }));
    });
  };

  const deletePost = async (postId) => {
    if (!confirm('Удалить пост?')) return;
    try {
      await api.delete(`/feed/${postId}`);
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.success('Пост удалён');
    } catch { toast.error('Ошибка'); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}><ArrowLeft size={20} /></button>
        <h1 className={styles.title}>Лента</h1>
      </div>

      <div className={styles.feed}>
        {/* Форма создания поста */}
        <div className={styles.composer}>
          <Avatar user={user} size={42} />
          <div className={styles.composerRight}>
            <textarea
              className={styles.composerInput}
              placeholder="Что у вас нового?"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              maxLength={5000}
            />
            {imageData && (
              <div className={styles.imagePreviewWrap}>
                <img src={imageData} className={styles.imagePreview} alt="preview" />
                <button className={styles.removeImage} onClick={() => setImageData(null)}><X size={14} /></button>
              </div>
            )}
            <div className={styles.composerActions}>
              <button className={styles.composerTool} onClick={() => fileInputRef.current?.click()} title="Фото">
                <Image size={18} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
              <span className={styles.charCount}>{text.length}/5000</span>
              <button
                className={`${styles.postBtn} ${(text.trim() || imageData) ? styles.postBtnActive : ''}`}
                onClick={submitPost}
                disabled={posting || (!text.trim() && !imageData)}
              >
                {posting ? '...' : <><Send size={15} /> Опубликовать</>}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingWrap}><span className={styles.spinner} /></div>
        ) : posts.length === 0 ? (
          <div className={styles.empty}>
            <p>Лента пуста</p>
            <p className={styles.emptyHint}>Будьте первым — напишите пост!</p>
          </div>
        ) : (
          <>
            {posts.map(post => (
              <div key={post.id} className={styles.post}>
                <div className={styles.postHeader}>
                  <button className={styles.postAuthor} onClick={() => setViewProfileId(post.user_id)}>
                    <Avatar user={{ display_name: post.display_name, avatar_color: post.avatar_color }} size={40} />
                    <div>
                      <span className={styles.postAuthorName}>{post.display_name}</span>
                      <span className={styles.postMeta}>@{post.username} · {formatMessageTime(post.created_at)}</span>
                    </div>
                  </button>
                  {post.user_id === user?.id && (
                    <button className={styles.deleteBtn} onClick={() => deletePost(post.id)} title="Удалить">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {post.content && <p className={styles.postContent}>{post.content}</p>}
                {post.image_data && (
                  <img
                    src={post.image_data}
                    className={styles.postImage}
                    alt="пост"
                    onClick={() => window.open(post.image_data, '_blank')}
                  />
                )}

                <div className={styles.postActions}>
                  <button
                    className={`${styles.actionBtn} ${post.liked_by_me ? styles.liked : ''}`}
                    onClick={() => toggleLike(post.id)}
                  >
                    <Heart size={16} fill={post.liked_by_me ? 'currentColor' : 'none'} />
                    <span>{post.likes_count}</span>
                  </button>
                  <button
                    className={`${styles.actionBtn} ${expandedComments[post.id] ? styles.active : ''}`}
                    onClick={() => toggleComments(post.id)}
                  >
                    <MessageCircle size={16} />
                    <span>{post.comments_count}</span>
                  </button>
                </div>

                {expandedComments[post.id] && (
                  <div className={styles.comments}>
                    {(commentsData[post.id] || []).map(c => (
                      <div key={c.id} className={styles.comment}>
                        <button onClick={() => setViewProfileId(c.user_id)}>
                          <Avatar user={{ display_name: c.display_name, avatar_color: c.avatar_color }} size={28} />
                        </button>
                        <div className={styles.commentBody}>
                          <span className={styles.commentAuthor}>{c.display_name}</span>
                          <p className={styles.commentText}>{c.content}</p>
                        </div>
                      </div>
                    ))}
                    <div className={styles.commentInput}>
                      <Avatar user={user} size={28} />
                      <input
                        className={styles.commentField}
                        placeholder="Комментарий..."
                        value={commentText[post.id] || ''}
                        onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && submitComment(post.id)}
                        maxLength={1000}
                      />
                      <button className={styles.commentSend} onClick={() => submitComment(post.id)}>
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {hasMore && (
              <button className={styles.loadMore} onClick={() => loadPosts(posts[posts.length - 1]?.created_at)}>
                Загрузить ещё
              </button>
            )}
          </>
        )}
      </div>

      {viewProfileId && (
        <UserProfile
          userId={viewProfileId}
          onClose={() => setViewProfileId(null)}
          onOpenChat={null}
        />
      )}
    </div>
  );
};

export default FeedPage;
