import React from 'react';
import { getInitials } from '../utils/format';
import styles from './Avatar.module.css';

const Avatar = ({ user, size = 40, showOnline = false }) => {
  const initials = getInitials(user?.display_name || user?.username);
  const color = user?.avatar_color || '#4f9cf9';
  const isOnline = user?.is_online === 1 || user?.is_online === true;
  const avatarData = user?.avatar_data;

  return (
    <div
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        background: avatarData ? 'transparent' : color,
        fontSize: size * 0.38,
      }}
    >
      {avatarData ? (
        <img
          src={avatarData}
          alt={user?.display_name || user?.username}
          className={styles.avatarImg}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span>{initials}</span>
      )}
      {showOnline && isOnline && (
        <span className={styles.onlineDot} />
      )}
    </div>
  );
};

export default Avatar;
