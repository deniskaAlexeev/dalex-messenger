import React, { useState, useRef, useEffect } from 'react';
import styles from './VoiceMessage.module.css';

const VoiceMessage = ({ src, duration, isMine }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  const fmt = (s) => {
    const sec = Math.round(s || 0);
    return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
  };

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { audioRef.current.play(); }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    const d = audioRef.current.duration || 1;
    setCurrentTime(t);
    setProgress((t / d) * 100);
  };

  const handleSeek = (e) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * (audioRef.current.duration || 0);
  };

  return (
    <div className={`${styles.voice} ${isMine ? styles.voiceMine : ''}`}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
        onTimeUpdate={handleTimeUpdate}
      />
      <button className={styles.playBtn} onClick={toggle}>
        {playing ? '⏸' : '▶️'}
      </button>
      <div className={styles.waveWrap}>
        <div className={styles.progressBar} onClick={handleSeek}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          <div className={styles.progressDot} style={{ left: `${progress}%` }} />
        </div>
        <span className={styles.duration}>{fmt(playing ? currentTime : duration)}</span>
      </div>
    </div>
  );
};

export default VoiceMessage;
