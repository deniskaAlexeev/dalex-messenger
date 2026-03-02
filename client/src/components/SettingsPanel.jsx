import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
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
  const { user, updateUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color || '#4f9cf9');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error('Имя не может быть пустым');
      return;
    }
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

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Настройки</h2>
        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
      </div>

      <div className={styles.content}>
        {/* Avatar preview */}
        <div className={styles.avatarSection}>
          <Avatar
            user={{ display_name: displayName || user?.display_name, avatar_color: avatarColor }}
            size={80}
          />
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

        {/* Username (read-only) */}
        <div className={styles.field}>
          <label className={styles.label}>Имя пользователя</label>
          <input
            className={`${styles.input} ${styles.inputReadonly}`}
            value={`@${user?.username}`}
            readOnly
          />
          <p className={styles.hint}>Имя пользователя изменить нельзя</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Отображаемое имя</label>
          <input
            className={styles.input}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={64}
          />
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
          <input
            className={`${styles.input} ${styles.inputReadonly}`}
            value={user?.email}
            readOnly
          />
        </div>

        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <span className={styles.spinner} /> : <><Save size={16} /> Сохранить</>}
        </button>
      </div>

      <div className={styles.footer}>
        <p>ДАЛЕКС v1.0.0</p>
        <p>Разработчик: Денис Алексеев</p>
      </div>
    </div>
  );
};

export default SettingsPanel;
