import React, { useState, useRef } from 'react';
import { X, Save, Lock, Eye, EyeOff, Camera, Trash2, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';
import Avatar from './Avatar';
import api from '../utils/api';
import styles from './SettingsPanel.module.css';

const COLORS = [
  '#4f9cf9', '#f97316', '#22c55e', '#a855f7',
  '#ec4899', '#06b6d4', '#eab308', '#ef4444',
  '#8b5cf6', '#14b8a6'
];

const SettingsPanel = ({ onClose }) => {
  const { user, updateUser, logout } = useAuthStore();

  // Профиль
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color || '#4f9cf9');
  const [saving, setSaving] = useState(false);

  // Аватар
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_data || null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Смена пароля
  const [pwSection, setPwSection] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Тема
  const [theme, setTheme] = useState(() => localStorage.getItem('dalex_theme') || 'dark');

  const applyTheme = (t) => {
    setTheme(t);
    localStorage.setItem('dalex_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  // ── Сохранить профиль ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!displayName.trim()) return toast.error('Имя не может быть пустым');
    setSaving(true);
    try {
      const { data } = await api.patch('/users/me', { displayName, bio, avatarColor });
      updateUser(data);
      toast.success('Профиль обновлён!');
    } catch {
      toast.error('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  // ── Загрузить аватар ─────────────────────────────────────────────────
  const handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Выберите изображение');
    if (file.size > 2 * 1024 * 1024) return toast.error('Максимальный размер — 2МБ');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target.result;
      setAvatarPreview(data);
      setAvatarLoading(true);
      try {
        await api.patch('/users/me/avatar', { avatarData: data });
        updateUser({ ...user, avatar_data: data });
        toast.success('Аватар обновлён!');
      } catch {
        toast.error('Ошибка загрузки аватара');
        setAvatarPreview(user?.avatar_data || null);
      } finally {
        setAvatarLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    setAvatarLoading(true);
    try {
      await api.delete('/users/me/avatar');
      setAvatarPreview(null);
      updateUser({ ...user, avatar_data: null });
      toast.success('Аватар удалён');
    } catch {
      toast.error('Ошибка');
    } finally {
      setAvatarLoading(false);
    }
  };

  // ── Сменить пароль ───────────────────────────────────────────────────
  const handlePasswordChange = async () => {
    if (!currentPw || !newPw || !confirmPw) return toast.error('Заполните все поля');
    if (newPw !== confirmPw) return toast.error('Пароли не совпадают');
    if (newPw.length < 6) return toast.error('Минимум 6 символов');

    setPwSaving(true);
    try {
      await api.patch('/auth/password', { currentPassword: currentPw, newPassword: newPw });
      toast.success('Пароль изменён. Выполняется выход...');
      setTimeout(() => logout(), 1500);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка смены пароля');
    } finally {
      setPwSaving(false);
    }
  };

  const previewUser = {
    display_name: displayName || user?.display_name,
    avatar_color: avatarColor,
    avatar_data: avatarPreview
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Настройки</h2>
        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
      </div>

      <div className={styles.content}>

        {/* ── Аватар ── */}
        <div className={styles.avatarSection}>
          <div className={styles.avatarWrap}>
            <Avatar user={previewUser} size={80} />
            <div className={styles.avatarActions}>
              <button
                className={styles.avatarBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarLoading}
                title="Загрузить фото"
              >
                <Camera size={14} />
              </button>
              {avatarPreview && (
                <button
                  className={`${styles.avatarBtn} ${styles.avatarBtnDanger}`}
                  onClick={handleRemoveAvatar}
                  disabled={avatarLoading}
                  title="Удалить фото"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              style={{ display: 'none' }}
            />
          </div>
          <div>
            <p className={styles.avatarLabel}>Цвет аватара</p>
            <div className={styles.colorPicker}>
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`${styles.colorSwatch} ${avatarColor === c ? styles.colorSwatchActive : ''}`}
                  style={{ background: c }}
                  onClick={() => setAvatarColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Профиль ── */}
        <div className={styles.field}>
          <label className={styles.label}>Имя пользователя</label>
          <input className={`${styles.input} ${styles.inputReadonly}`} value={`@${user?.username}`} readOnly />
          <p className={styles.hint}>Нельзя изменить</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Отображаемое имя</label>
          <input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={64} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>О себе</label>
          <textarea
            className={styles.textarea}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Расскажите о себе..."
            maxLength={256}
            rows={3}
          />
          <p className={styles.hint}>{bio.length}/256</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <input className={`${styles.input} ${styles.inputReadonly}`} value={user?.email} readOnly />
        </div>

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? <span className={styles.spinner} /> : <><Save size={16} /> Сохранить профиль</>}
        </button>

        {/* ── Тема ── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Оформление</h3>
          <div className={styles.themeToggle}>
            <button
              className={`${styles.themeBtn} ${theme === 'dark' ? styles.themeBtnActive : ''}`}
              onClick={() => applyTheme('dark')}
            >
              <Moon size={15} /> Тёмная
            </button>
            <button
              className={`${styles.themeBtn} ${theme === 'light' ? styles.themeBtnActive : ''}`}
              onClick={() => applyTheme('light')}
            >
              <Sun size={15} /> Светлая
            </button>
          </div>
        </div>

        {/* ── Безопасность ── */}
        <div className={styles.section}>
          <button
            className={styles.sectionToggle}
            onClick={() => setPwSection(v => !v)}
          >
            <Lock size={15} />
            Сменить пароль
            <span className={`${styles.arrow} ${pwSection ? styles.arrowOpen : ''}`}>▾</span>
          </button>

          {pwSection && (
            <div className={`${styles.pwForm} pop-in`}>
              <div className={styles.pwField}>
                <input
                  className={styles.input}
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="Текущий пароль"
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                />
                <button className={styles.eyeBtn} onClick={() => setShowCurrent(v => !v)} type="button">
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className={styles.pwField}>
                <input
                  className={styles.input}
                  type={showNew ? 'text' : 'password'}
                  placeholder="Новый пароль (мин. 6 символов)"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                />
                <button className={styles.eyeBtn} onClick={() => setShowNew(v => !v)} type="button">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <input
                className={styles.input}
                type="password"
                placeholder="Повторите новый пароль"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
              />
              {newPw && confirmPw && newPw !== confirmPw && (
                <p className={styles.pwError}>Пароли не совпадают</p>
              )}
              <button
                className={styles.saveBtn}
                onClick={handlePasswordChange}
                disabled={pwSaving || (newPw && confirmPw && newPw !== confirmPw)}
              >
                {pwSaving ? <span className={styles.spinner} /> : <><Lock size={14} /> Сменить пароль</>}
              </button>
            </div>
          )}
        </div>

      </div>

      <div className={styles.footer}>
        <p>ДАЛЕКС v1.1.0</p>
        <p>Разработчик: Денис Алексеев</p>
      </div>
    </div>
  );
};

export default SettingsPanel;
