import { useCallback, useRef } from 'react';
import { toast as sonnerToast } from 'sonner';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export const useToast = () => {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBeep = useCallback((type: ToastType) => {
    if (type !== 'error' && type !== 'warning') return;

    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = type === 'error' ? 880 : 660;
      gain.gain.value = 0.05;

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // ignore audio errors
    }
  }, []);

  const showToast = useCallback(
    (msg: string, type: ToastType = 'success') => {
      playBeep(type);
      
      const options = {
        duration: type === 'error' ? 5000 : 3000,
      };

      switch (type) {
        case 'success':
          sonnerToast.success(msg, options);
          break;
        case 'error':
          sonnerToast.error(msg, options);
          break;
        case 'warning':
          sonnerToast.warning(msg, options);
          break;
        case 'info':
          sonnerToast.info(msg, options);
          break;
        default:
          sonnerToast(msg, options);
      }
    },
    [playBeep]
  );

  const clearToast = useCallback(() => {
    sonnerToast.dismiss();
  }, []);

  return { toast: null, showToast, clearToast };
};
