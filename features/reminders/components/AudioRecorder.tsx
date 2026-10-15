import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Upload, AlertCircle } from 'lucide-react';
import { audioBlobToBase64 } from '../services/reminder.service';
import { AudioPlayer } from './AudioPlayer';

interface AudioRecorderProps {
  initialAudioUrl?: string;
  initialDuration?: number;
  onAudioChange: (audioUrl?: string, duration?: number) => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  initialAudioUrl,
  initialDuration,
  onAudioChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(initialAudioUrl);
  const [duration, setDuration] = useState<number | undefined>(initialDuration);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAudioUrl(initialAudioUrl);
    setDuration(initialDuration);
  }, [initialAudioUrl, initialDuration]);

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  const startRecording = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pickMimeType = () => {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        for (const t of types) {
          if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
            return t;
          }
        }
        return '';
      };

      const mimeType = pickMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        cleanup();
        setIsRecording(false);

        const finalMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        
        try {
          const base64 = await audioBlobToBase64(blob);
          const finalDuration = recordSeconds || 1;
          setAudioUrl(base64);
          setDuration(finalDuration);
          onAudioChange(base64, finalDuration);
        } catch (e) {
          setErrorMsg('Falha ao processar áudio.');
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordSeconds(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      cleanup();
      console.error('[AudioRecorder] Erro ao acessar microfone:', err);
      setErrorMsg('Acesso ao microfone não permitido ou indisponível.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setErrorMsg('Por favor, selecione um arquivo de áudio válido.');
      return;
    }

    try {
      const base64 = await audioBlobToBase64(file);
      setAudioUrl(base64);
      setDuration(undefined);
      onAudioChange(base64, undefined);
    } catch {
      setErrorMsg('Erro ao ler arquivo de áudio.');
    }
  };

  const handleRemoveAudio = () => {
    setAudioUrl(undefined);
    setDuration(undefined);
    onAudioChange(undefined, undefined);
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-2">
      {audioUrl ? (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <AudioPlayer src={audioUrl} duration={duration} />
          </div>
          <button
            type="button"
            onClick={handleRemoveAudio}
            className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
            title="Remover áudio"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : isRecording ? (
        <div className="flex items-center justify-between bg-rose-950/40 border border-rose-500/40 rounded-xl px-4 py-3 text-rose-300 animate-pulse">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider">Gravando Áudio...</span>
            <span className="font-mono text-sm font-black text-white">{formatSec(recordSeconds)}</span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-transform active:scale-95 shadow-lg shadow-rose-600/30"
          >
            <Square size={13} className="fill-white" />
            <span>Concluir</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startRecording}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-semibold transition-all active:scale-98 hover:border-blue-500/50"
          >
            <Mic size={15} className="text-blue-400" />
            <span>Gravar Áudio</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 text-xs font-semibold transition-all hover:border-slate-600"
            title="Enviar arquivo de áudio"
          >
            <Upload size={14} className="text-slate-400" />
            <span className="hidden sm:inline">Arquivo</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
          <AlertCircle size={13} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
