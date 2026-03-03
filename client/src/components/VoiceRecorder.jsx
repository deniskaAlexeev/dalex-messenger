import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Trash2 } from 'lucide-react';
import styles from './VoiceRecorder.module.css';

const VoiceRecorder = ({ onSend, onCancel }) => {
  const [state, setState] = useState('idle'); // idle | recording | preview
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioData, setAudioData] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    stopStream();
  }, []);

  const stopStream = () => {
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: getSupportedMime() });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: getSupportedMime() });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Convert to base64
        const reader = new FileReader();
        reader.onload = () => setAudioData(reader.result);
        reader.readAsDataURL(blob);
        setState('preview');
        stopStream();
      };

      mr.start(100);
      setState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(d => {
          if (d >= 120) { stopRecording(); return d; } // max 2 min
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      alert('Нет доступа к микрофону. Разрешите доступ в браузере.');
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    clearInterval(timerRef.current);
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null); setAudioData(null); setDuration(0);
    setState('idle');
    onCancel?.();
  };

  const handleSend = () => {
    if (audioData) { onSend(audioData, duration); cancelRecording(); }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const getSupportedMime = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  if (state === 'idle') return (
    <button className={styles.micBtn} onClick={startRecording} title="Голосовое сообщение">
      <Mic size={20} />
    </button>
  );

  return (
    <div className={styles.recorder}>
      {state === 'recording' && (
        <>
          <span className={styles.recDot} />
          <span className={styles.timer}>{fmt(duration)}</span>
          <span className={styles.recLabel}>Запись...</span>
          <button className={styles.btnStop} onClick={stopRecording} title="Остановить"><Square size={16} /></button>
          <button className={styles.btnCancel} onClick={cancelRecording} title="Отмена"><Trash2 size={16} /></button>
        </>
      )}
      {state === 'preview' && (
        <>
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} />
          )}
          <button className={styles.playBtn} onClick={togglePlay}>
            {playing ? '⏸' : '▶️'}
          </button>
          <span className={styles.timer}>{fmt(duration)}</span>
          <button className={styles.btnSend} onClick={handleSend} title="Отправить"><Send size={16} /></button>
          <button className={styles.btnCancel} onClick={cancelRecording} title="Удалить"><Trash2 size={16} /></button>
        </>
      )}
    </div>
  );
};

export default VoiceRecorder;
