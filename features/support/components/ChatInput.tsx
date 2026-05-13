import React, { useState, useRef } from 'react';
import { Send, Paperclip, Mic, X, Loader2, MapPin } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { AttachMenu } from './AttachMenu';
import { SupportMessageType } from '../../../services/supportChat.service';

interface ChatInputProps {
  onSend: (text: string, type?: SupportMessageType, file?: File, meta?: any) => Promise<void>;
  isUploading: boolean;
  placeholder?: string;
  chatTheme?: 'dark' | 'blue';
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isUploading, placeholder, chatTheme = 'dark' }) => {
  const [text, setText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isRecording, recordMs, startRecording, stopRecording, cancelRecording } = useAudioRecorder();

  const handleSendText = async () => {
    if (!text.trim()) return;
    await onSend(text, 'text');
    setText('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const type = isImage ? 'image' : 'file';
    const caption = isImage ? '📷 Imagem' : `📎 Arquivo: ${file.name}`;

    onSend(caption, type, file);

    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowAttachMenu(false);
  };

  const handleAttachSelect = (type: 'location' | 'image' | 'file') => {
    if (type === 'location') {
      if (!navigator.geolocation) {
        onSend('⚠️ Seu navegador não suporta localização.', 'text');
        setShowAttachMenu(false);
        return;
      }

      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const url = `https://maps.google.com/?q=${lat},${lng}`;
            await onSend(url, 'location', undefined, { lat, lng });
          } finally {
            setIsLocating(false);
            setShowAttachMenu(false);
          }
        },
        (err) => {
          console.error(`Geolocation error (${err.code}): ${err.message}`);
          onSend('⚠️ Não foi possível obter sua localização. Verifique as permissões do navegador.', 'text');
          setIsLocating(false);
          setShowAttachMenu(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (result) {
      await onSend('🎤 Mensagem de voz', 'audio', result.audioFile, { duration_ms: result.duration });
    }
  };

  const formatRecordTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${String(rs).padStart(2, '0')}`;
  };

  return (
    <div className={`px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] relative z-30 shrink-0 backdrop-blur-3xl border-t ${
      chatTheme === 'blue' 
        ? 'bg-slate-900/60 border-blue-500/20 shadow-[0_-20px_50px_rgba(30,41,59,0.5)]' 
        : 'bg-slate-950/40 border-slate-800/50 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]'
    }`}>
      {showAttachMenu && <AttachMenu onSelect={handleAttachSelect} fileInputRef={fileInputRef} />}

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

      {isRecording ? (
        <div className="flex items-center gap-4 bg-slate-900/90 backdrop-blur-md p-4 rounded-[2rem] animate-in fade-in slide-in-from-bottom-4 border border-rose-500/20 shadow-2xl shadow-rose-950/30">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative">
              <span className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-20"></span>
              <div className="w-3 h-3 bg-rose-500 rounded-full relative z-10"></div>
            </div>
            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
              Gravando Áudio {formatRecordTime(recordMs)}
            </span>
          </div>

          <button
            onClick={cancelRecording}
            className="px-4 py-2 text-rose-400 hover:text-white hover:bg-rose-500/10 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest"
          >
            Descartar
          </button>

          <button onClick={handleStopRecording} className="w-12 h-12 bg-emerald-600 rounded-2xl text-white hover:bg-emerald-500 shadow-xl shadow-emerald-900/40 flex items-center justify-center transition-all active:scale-90">
            <Send size={20} className="ml-0.5" />
          </button>
        </div>
      ) : (
        <div className="flex gap-4 items-end">
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-90 border ${
                showAttachMenu 
                ? 'bg-blue-600 border-blue-400 text-white shadow-blue-500/20' 
                : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            {showAttachMenu ? <X size={20} /> : <Paperclip size={20} />}
          </button>

          <div className="flex-1 bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-[1.5rem] flex items-center focus-within:border-blue-500/40 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all duration-300 shadow-inner group">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              className="w-full bg-transparent px-5 py-4 text-white text-[13px] font-medium outline-none resize-none max-h-32 custom-scrollbar placeholder:text-slate-600"
              placeholder={placeholder || 'Sua mensagem aqui...'}
              rows={1}
              style={{ minHeight: '52px' }}
              disabled={isUploading}
            />
          </div>

          {text.trim() ? (
            <button
              onClick={handleSendText}
              disabled={isUploading}
              className="w-12 h-12 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 active:scale-90 disabled:opacity-50 flex items-center justify-center border border-blue-400/30"
            >
              {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} className="ml-0.5" />}
            </button>
          ) : (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                startRecording();
              }}
              disabled={isUploading || isLocating}
              className="w-12 h-12 bg-slate-900/50 text-slate-400 hover:text-white border border-slate-800 rounded-2xl transition-all active:scale-90 hover:bg-slate-800 shadow-lg flex items-center justify-center"
            >
              {isLocating ? <Loader2 size={20} className="animate-spin text-blue-500" /> : <Mic size={20} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
