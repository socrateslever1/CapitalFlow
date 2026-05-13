let sharedAudioContext: AudioContext | null = null;
let lastPlayedAt = 0;

export const playNotificationSound = () => {
  try {
    const now = Date.now();
    if (now - lastPlayedAt < 1200) return;
    lastPlayedAt = now;

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextCtor();
    }

    const ctx = sharedAudioContext;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const startAt = ctx.currentTime + 0.01;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, startAt);
    gain1.gain.setValueAtTime(0.0001, startAt);
    gain1.gain.exponentialRampToValueAtTime(0.07, startAt + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
    osc1.start(startAt);
    osc1.stop(startAt + 0.18);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, startAt + 0.14);
    gain2.gain.setValueAtTime(0.0001, startAt + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.05, startAt + 0.17);
    gain2.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34);
    osc2.start(startAt + 0.14);
    osc2.stop(startAt + 0.34);
  } catch (e) {
    console.error('Erro ao tocar som', e);
  }
};
