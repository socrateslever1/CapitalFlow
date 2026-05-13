
import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';

function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const AudioPlayer = ({
  src,
  duration
}: {
  src: string;
  duration?: number;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(duration || 0);

  useEffect(() => {
    setIsReady(false);
    setIsBuffering(false);
    setIsPlaying(false);
    setLoadError(false);
    setCurrentTime(0);
    setTotalTime(duration || 0);

    const a = audioRef.current;
    if (!a) return;

    a.pause();
    a.currentTime = 0;
    if (src) {
      a.load();
    }
  }, [src, duration]);

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a || !src || loadError) return;

    try {
      if (a.paused) {
        setIsBuffering(true);
        await a.play();
      } else {
        a.pause();
      }
    } catch (err) {
      console.error('[AudioPlayer] play catch:', err);
      // Alguns browsers requerem load() antes de play() se houve erro prévio
      if (!isReady) a.load();
    }
  };

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    const d = isFinite(a.duration) && a.duration > 0 ? a.duration : (duration || 0);
    setTotalTime(d);
    setIsReady(true);
    setLoadError(false);
  };

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime || 0);
  };

  const onPlay = () => {
    setIsPlaying(true);
    setIsBuffering(false);
    setLoadError(false);
  };

  const onPause = () => {
    setIsPlaying(false);
    setIsBuffering(false);
  };

  const onEnded = () => {
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    if(audioRef.current) audioRef.current.currentTime = 0;
  };

  const onWaiting = () => setIsBuffering(true);
  const onCanPlay = () => setIsBuffering(false);

  const onError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const error = (e.target as HTMLAudioElement).error;
    setIsPlaying(false);
    setIsBuffering(false);
    setLoadError(true);
    console.error('[AudioPlayer] MediaError:', {
      code: error?.code,
      message: error?.message,
      src
    });
  };

  const progress = totalTime > 0 ? Math.min(100, (currentTime / totalTime) * 100) : 0;

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !totalTime || loadError) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    a.currentTime = pct * totalTime;
    setCurrentTime(a.currentTime);
  };

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl min-w-[200px] transition-colors ${loadError ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-black/20'}`}>
      <button
        onClick={togglePlay}
        type="button"
        disabled={!src || (loadError && !isReady)}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
           loadError ? 'bg-rose-500 text-white' : 'bg-white text-black hover:scale-105 active:scale-95'
        }`}
      >
        {isBuffering ? (
          <Loader2 size={14} className="animate-spin" />
        ) : loadError ? (
          <Play size={14} fill="currentColor" className="ml-[1px] opacity-50" />
        ) : isPlaying ? (
          <Pause size={14} fill="currentColor" />
        ) : (
          <Play size={14} fill="currentColor" className="ml-[1px]" />
        )}
      </button>

      <div className="flex-1 flex flex-col justify-center h-full gap-1 min-w-0">
        {loadError ? (
          <div className="flex flex-col gap-1">
             <span className="text-[8px] text-rose-400 font-bold uppercase tracking-wider">Falha ao carregar áudio</span>
             <a 
               href={src} 
               target="_blank" 
               rel="noreferrer" 
               className="text-[9px] text-white/50 hover:text-white underline decoration-rose-500/50"
             >
               Baixar arquivo
             </a>
          </div>
        ) : (
          <>
            <div
              className="h-1 bg-white/20 rounded-full w-full overflow-hidden cursor-pointer"
              onClick={seek}
            >
              <div className="h-full bg-white transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>

            <div className="flex justify-between text-[8px] text-white/70 font-mono">
              <span className="truncate">{!isReady ? '...' : isPlaying ? 'Ouvindo...' : 'Áudio'}</span>
              <span>{formatTime(currentTime)} / {formatTime(totalTime || 0)}</span>
            </div>
          </>
        )}
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onWaiting={onWaiting}
        onCanPlay={onCanPlay}
        onError={onError}
        className="hidden"
      />
    </div>
  );
};
