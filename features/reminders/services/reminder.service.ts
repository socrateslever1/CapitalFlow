import { ReminderItem, ReminderFormData } from '../types';
import { supabase } from '../../../lib/supabase';
import { ThemeSound } from '../themes/reminderThemes';

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextCtor();
    }
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume();
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Toca o som temático de alerta de acordo com o meme ou estilo escolhido.
 */
export function playThemeSound(sound?: ThemeSound): void {
  switch (sound) {
    case 'CASH_REGISTER':
      playCashRegisterSound();
      break;
    case 'SIREN':
      playSirenSound();
      break;
    case 'RETRO_ALARM':
      playRetroAlarmSound();
      break;
    case 'SUCCESS_FANFARE':
      playSuccessFanfareSound();
      break;
    case 'CHIME':
    default:
      playReminderAlertSound();
      break;
  }
}

/**
 * Som de Caixa Registradora (Ka-ching!) - para Julius e temas financeiros.
 */
export function playCashRegisterSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startAt = ctx.currentTime + 0.02;

    // Ding 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.5, startAt); // E6
    gain1.gain.setValueAtTime(0.001, startAt);
    gain1.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, startAt + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(startAt);
    osc1.stop(startAt + 0.26);

    // Ding 2 (Ka-ching!)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2093.0, startAt + 0.12); // C7
    gain2.gain.setValueAtTime(0.001, startAt + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.3, startAt + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, startAt + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(startAt + 0.12);
    osc2.stop(startAt + 0.56);
  } catch (e) {
    console.warn('[Audio] Falha ao tocar som de caixa registradora:', e);
  }
}

/**
 * Som de Sirene de Emergência - para Michael Scott e alertas caóticos.
 */
export function playSirenSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startAt = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650, startAt);
    osc.frequency.linearRampToValueAtTime(950, startAt + 0.2);
    osc.frequency.linearRampToValueAtTime(650, startAt + 0.4);
    osc.frequency.linearRampToValueAtTime(950, startAt + 0.6);
    osc.frequency.linearRampToValueAtTime(650, startAt + 0.8);

    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.85);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + 0.86);
  } catch (e) {
    console.warn('[Audio] Falha ao tocar som de sirene:', e);
  }
}

/**
 * Som de Alarme Retrô 8-bit - para Seu Madruga ("Pague o Aluguel!").
 */
export function playRetroAlarmSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startAt = ctx.currentTime + 0.02;
    const notes = [
      { freq: 440, dur: 0.08 },
      { freq: 880, dur: 0.08 },
      { freq: 440, dur: 0.08 },
      { freq: 880, dur: 0.12 },
    ];

    let t = startAt;
    notes.forEach(({ freq, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.01);
      t += dur + 0.04;
    });
  } catch (e) {
    console.warn('[Audio] Falha ao tocar som retrô:', e);
  }
}

/**
 * Fanfarra de Sucesso & Conquista - para Gatsby e Drake.
 */
export function playSuccessFanfareSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startAt = ctx.currentTime + 0.02;
    const notes = [
      { freq: 523.25, time: 0.00, dur: 0.12 }, // C5
      { freq: 659.25, time: 0.10, dur: 0.12 }, // E5
      { freq: 783.99, time: 0.20, dur: 0.14 }, // G5
      { freq: 1046.50, time: 0.32, dur: 0.40 }, // C6
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt + time);
      gain.gain.setValueAtTime(0.001, startAt + time);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt + time);
      osc.stop(startAt + time + dur + 0.05);
    });
  } catch (e) {
    console.warn('[Audio] Falha ao tocar fanfarra:', e);
  }
}

/**
 * Toca um som de alerta harmonioso para despertar a atenção no horário do lembrete.
 */
export function playReminderAlertSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startAt = ctx.currentTime + 0.05;
    const notes = [
      { freq: 587.33, start: 0.00, dur: 0.18 }, // D5
      { freq: 739.99, start: 0.12, dur: 0.18 }, // F#5
      { freq: 880.00, start: 0.24, dur: 0.22 }, // A5
      { freq: 1174.66, start: 0.38, dur: 0.45 }, // D6
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt + start);

      gain.gain.setValueAtTime(0.0001, startAt + start);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startAt + start);
      osc.stop(startAt + start + dur + 0.05);
    });
  } catch (e) {
    console.warn('[ReminderService] Falha ao tocar som:', e);
  }
}

/**
 * Toca um som de confirmação quando a tarefa é marcada como concluída.
 */
export function playTaskCompleteSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startAt = ctx.currentTime + 0.02;
    const notes = [
      { freq: 523.25, start: 0.00, dur: 0.12 }, // C5
      { freq: 659.25, start: 0.08, dur: 0.14 }, // E5
      { freq: 1046.50, start: 0.16, dur: 0.35 }, // C6
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startAt + start);

      gain.gain.setValueAtTime(0.0001, startAt + start);
      gain.gain.exponentialRampToValueAtTime(0.18, startAt + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startAt + start);
      osc.stop(startAt + start + dur + 0.05);
    });
  } catch (e) {
    console.warn('[ReminderService] Falha ao tocar som de conclusão:', e);
  }
}

/**
 * Converte arquivo de imagem para Base64 comprimido para não inflar o armazenamento.
 */
export async function compressAndConvertToBase64(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Converte blob de áudio para Base64 Data URL persistente.
 */
export async function audioBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function getStorageKey(userId: string): string {
  return `capitalflow_reminders_${userId || 'guest'}`;
}

export const reminderService = {
  /**
   * Obtém a lista de lembretes do usuário do localStorage.
   */
  getReminders(userId: string): ReminderItem[] {
    try {
      const raw = localStorage.getItem(getStorageKey(userId));
      if (!raw) return [];
      const items: ReminderItem[] = JSON.parse(raw);
      if (!Array.isArray(items)) return [];
      return items.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    } catch (e) {
      console.error('[ReminderService] Erro ao ler lembretes:', e);
      return [];
    }
  },

  /**
   * Salva lista completa no localStorage.
   */
  saveAll(userId: string, reminders: ReminderItem[]): void {
    try {
      localStorage.setItem(getStorageKey(userId), JSON.stringify(reminders));
    } catch (e) {
      console.error('[ReminderService] Erro ao salvar lembretes:', e);
    }
  },

  /**
   * Cria um novo lembrete.
   */
  createReminder(userId: string, data: ReminderFormData): ReminderItem {
    const now = new Date().toISOString();
    // Monta a data/hora agendada
    const [year, month, day] = data.dueDate.split('-').map(Number);
    const [hour, min] = data.dueTime.split(':').map(Number);
    const scheduledDate = new Date(year, month - 1, day, hour, min, 0, 0);

    const newItem: ReminderItem = {
      id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId,
      title: data.title.trim(),
      description: data.description?.trim() || '',
      clientId: data.clientId,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      dueDate: data.dueDate,
      dueTime: data.dueTime,
      scheduledAt: scheduledDate.toISOString(),
      priority: data.priority,
      category: data.category,
      themeId: data.themeId,
      imageUrl: data.imageUrl,
      imageName: data.imageName,
      audioUrl: data.audioUrl,
      audioDuration: data.audioDuration,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    const current = this.getReminders(userId);
    current.push(newItem);
    this.saveAll(userId, current);

    // Tentativa assíncrona opcional de salvar no Supabase (silencioso)
    this.trySyncSupabase(newItem, 'INSERT').catch(() => {});

    return newItem;
  },

  /**
   * Atualiza um lembrete existente.
   */
  updateReminder(userId: string, id: string, patch: Partial<ReminderItem>): ReminderItem | null {
    const current = this.getReminders(userId);
    const index = current.findIndex(r => r.id === id);
    if (index === -1) return null;

    let scheduledAt = current[index].scheduledAt;
    const dueDate = patch.dueDate || current[index].dueDate;
    const dueTime = patch.dueTime || current[index].dueTime;

    if (patch.dueDate || patch.dueTime) {
      const [year, month, day] = dueDate.split('-').map(Number);
      const [hour, min] = dueTime.split(':').map(Number);
      scheduledAt = new Date(year, month - 1, day, hour, min, 0, 0).toISOString();
    }

    const updated: ReminderItem = {
      ...current[index],
      ...patch,
      dueDate,
      dueTime,
      scheduledAt,
      updatedAt: new Date().toISOString(),
    };

    current[index] = updated;
    this.saveAll(userId, current);

    this.trySyncSupabase(updated, 'UPDATE').catch(() => {});

    return updated;
  },

  /**
   * Marca um lembrete como CONCLUÍDO (ou reabre como pendente).
   */
  toggleComplete(userId: string, id: string): ReminderItem | null {
    const current = this.getReminders(userId);
    const item = current.find(r => r.id === id);
    if (!item) return null;

    const isNowCompleted = item.status !== 'COMPLETED';
    item.status = isNowCompleted ? 'COMPLETED' : 'PENDING';
    item.completedAt = isNowCompleted ? new Date().toISOString() : undefined;
    item.updatedAt = new Date().toISOString();

    if (isNowCompleted) {
      playTaskCompleteSound();
    }

    this.saveAll(userId, current);
    this.trySyncSupabase(item, 'UPDATE').catch(() => {});

    return item;
  },

  /**
   * Adia o lembrete por N minutos (Snooze).
   */
  snooze(userId: string, id: string, minutes: number): ReminderItem | null {
    const current = this.getReminders(userId);
    const item = current.find(r => r.id === id);
    if (!item) return null;

    const snoozedTime = new Date(Date.now() + minutes * 60 * 1000);
    item.snoozedUntil = snoozedTime.toISOString();
    item.lastAlertedAt = undefined; // Permite novo alerta quando o tempo expirar
    item.updatedAt = new Date().toISOString();

    this.saveAll(userId, current);
    this.trySyncSupabase(item, 'UPDATE').catch(() => {});

    return item;
  },

  /**
   * Registra que o alerta já foi exibido na tela para este horário.
   */
  markAlerted(userId: string, id: string): void {
    const current = this.getReminders(userId);
    const item = current.find(r => r.id === id);
    if (!item) return;

    item.lastAlertedAt = new Date().toISOString();
    this.saveAll(userId, current);
  },

  /**
   * Exclui um lembrete.
   */
  deleteReminder(userId: string, id: string): boolean {
    const current = this.getReminders(userId);
    const filtered = current.filter(r => r.id !== id);
    if (filtered.length === current.length) return false;

    this.saveAll(userId, filtered);
    this.trySyncSupabase({ id } as ReminderItem, 'DELETE').catch(() => {});
    return true;
  },

  /**
   * Sincronização segura com Supabase caso a tabela 'reminders' ou 'lembretes' exista.
   */
  async trySyncSupabase(item: Partial<ReminderItem>, action: 'INSERT' | 'UPDATE' | 'DELETE') {
    try {
      if (!supabase) return;
      if (action === 'DELETE') {
        await supabase.from('lembretes').delete().eq('id', item.id);
      } else if (action === 'INSERT') {
        await supabase.from('lembretes').insert({
          id: item.id,
          profile_id: item.userId,
          title: item.title,
          description: item.description,
          client_id: item.clientId,
          client_name: item.clientName,
          client_phone: item.clientPhone,
          due_date: item.dueDate,
          due_time: item.dueTime,
          scheduled_at: item.scheduledAt,
          priority: item.priority,
          category: item.category,
          image_url: item.imageUrl,
          audio_url: item.audioUrl,
          audio_duration: item.audioDuration,
          status: item.status,
          completed_at: item.completedAt,
        });
      } else if (action === 'UPDATE') {
        await supabase.from('lembretes').update({
          title: item.title,
          description: item.description,
          client_id: item.clientId,
          client_name: item.clientName,
          client_phone: item.clientPhone,
          due_date: item.dueDate,
          due_time: item.dueTime,
          scheduled_at: item.scheduledAt,
          priority: item.priority,
          category: item.category,
          image_url: item.imageUrl,
          audio_url: item.audioUrl,
          audio_duration: item.audioDuration,
          status: item.status,
          completed_at: item.completedAt,
          snoozed_until: item.snoozedUntil,
        }).eq('id', item.id);
      }
    } catch {
      // Ignora erro se tabela não existir
    }
  }
};
