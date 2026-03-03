import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';

export const formatMessageTime = (timestamp) => {
  const date = new Date(timestamp);
  return format(date, 'HH:mm');
};

export const formatMessageDate = (timestamp) => {
  const date = new Date(timestamp);
  if (isToday(date)) return 'Сегодня';
  if (isYesterday(date)) return 'Вчера';
  return format(date, 'd MMMM yyyy', { locale: ru });
};

export const formatLastSeen = (timestamp, isOnline) => {
  if (isOnline) return 'В сети';
  if (!timestamp) return 'Не в сети';
  const date = new Date(timestamp);
  if (isToday(date)) return `Был(а) сегодня в ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `Был(а) вчера в ${format(date, 'HH:mm')}`;
  return `Был(а) ${formatDistanceToNow(date, { addSuffix: true, locale: ru })}`;
};

export const formatConversationTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Вчера';
  return format(date, 'd MMM', { locale: ru });
};

export const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};
