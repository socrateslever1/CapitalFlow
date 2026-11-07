import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  Sparkles,
  RefreshCw,
  Upload,
  AlertCircle,
  CheckCircle2,
  ScanLine,
} from 'lucide-react';
import { recognizeCardFromImage, RecognizedCardData } from '../../utils/cardVisionRecognizer';

interface Props {
  onClose: () => void;
  onCardRecognized: (data: RecognizedCardData) => void;
}

export const CardCameraScannerModal: React.FC<Props> = ({ onClose, onCardRecognized }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<RecognizedCardData | null>(null);

  // Inicia a câmera
  const startCamera = async (mode: 'environment' | 'user') => {
    stopCamera();
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Câmera não suportada neste navegador.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Erro ao abrir câmera:', err);
      setCameraActive(false);
      setError('Não foi possível acessar a câmera. Você pode selecionar uma foto do cartão abaixo.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    void startCamera(facingMode);
    return () => stopCamera();
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Captura o frame do vídeo
  const captureFrame = async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao processar imagem.');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      const recognized = await recognizeCardFromImage(dataUrl);
      setSuccessData(recognized);
      setTimeout(() => {
        onCardRecognized(recognized);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Erro ao identificar o cartão.');
    } finally {
      setBusy(false);
    }
  };

  // Processa arquivo selecionado manualmente
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setError(null);

    try {
      const recognized = await recognizeCardFromImage(file);
      setSuccessData(recognized);
      setTimeout(() => {
        onCardRecognized(recognized);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Erro ao identificar o cartão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/90 p-3 sm:p-5 backdrop-blur-md"
    >
      <section className="relative flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-white shadow-2xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md">
              <Camera size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                Escanear Cartão com IA
                <Sparkles size={14} className="text-cyan-400" />
              </h2>
              <p className="text-[11px] text-slate-400">
                Aponte a câmera para a frente ou verso do cartão
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </header>

        {/* Visor da Câmera / Área de Escaneamento */}
        <div className="relative flex flex-1 flex-col items-center justify-center bg-black p-4 min-h-[300px]">
          {cameraActive ? (
            <div className="relative w-full aspect-[1.586/1] max-w-sm overflow-hidden rounded-2xl border-2 border-dashed border-cyan-400 shadow-2xl">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />

              {/* Guia de Alinhamento do Cartão */}
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
                <div className="flex justify-between items-start">
                  <div className="w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg" />
                  <div className="w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg" />
                </div>

                {/* Laser de Escaneamento Animado */}
                {busy && (
                  <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee] animate-bounce" />
                )}

                <div className="flex justify-between items-end">
                  <div className="w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg" />
                  <div className="w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br-lg" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-cyan-400">
                <ScanLine size={32} />
              </div>
              <p className="text-xs text-slate-300">
                Câmera desativada ou não autorizada.
              </p>
            </div>
          )}

          {/* Feedback de Sucesso */}
          {successData && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/85 p-6 backdrop-blur-sm animate-fade-in">
              <CheckCircle2 size={42} className="text-emerald-400" />
              <h3 className="text-base font-bold text-white">
                Cartão Identificado!
              </h3>
              <p className="text-xs text-slate-300 text-center">
                <strong>{successData.issuer}</strong> ({successData.brand}) — Final •••• {successData.last_four || '****'}
              </p>
              <span className="text-[10px] text-emerald-400">Preenchendo formulário...</span>
            </div>
          )}
        </div>

        {/* Alerta de Erro */}
        {error && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
            <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Rodapé de Ações */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 p-4 bg-slate-950/70">
          <div className="flex items-center gap-2">
            {cameraActive && (
              <button
                type="button"
                onClick={toggleCamera}
                disabled={busy}
                title="Alternar câmera"
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                <RefreshCw size={14} />
                Inverter
              </button>
            )}

            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition">
              <Upload size={14} />
              Enviar Foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={busy}
                onChange={handleFileUpload}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition"
            >
              Cancelar
            </button>

            {cameraActive && (
              <button
                type="button"
                disabled={busy}
                onClick={captureFrame}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 transition"
              >
                {busy ? (
                  <>
                    <Sparkles size={14} className="animate-spin" />
                    Identificando...
                  </>
                ) : (
                  <>
                    <Camera size={14} />
                    Capturar e Reconhecer
                  </>
                )}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
};
