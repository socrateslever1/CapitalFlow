import { useState, useEffect, useCallback, useRef } from 'react';
import { ReminderItem, ReminderFormData } from '../types';
import { reminderService, playReminderAlertSound, playThemeSound } from '../services/reminder.service';
import { getThemeById } from '../themes/reminderThemes';
import { notificationService } from '../../../services/notification.service';

export const useReminders = (userId: string | undefined) => {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [activeAlertReminder, setActiveAlertReminder] = useState<ReminderItem | null>(null);

  const effectiveUserId = userId || 'default_user';

  // Carrega lembretes
  const reloadReminders = useCallback(() => {
    const list = reminderService.getReminders(effectiveUserId);
    setReminders(list);
  }, [effectiveUserId]);

  useEffect(() => {
    reloadReminders();
  }, [reloadReminders]);

  // Ticker que verifica lembretes que atingiram o horário programado
  useEffect(() => {
    if (!effectiveUserId) return;

    const checkScheduledReminders = () => {
      const now = Date.now();
      const currentList = reminderService.getReminders(effectiveUserId);

      for (const item of currentList) {
        if (item.status !== 'PENDING') continue;

        const scheduledTime = new Date(item.scheduledAt).getTime();
        const snoozedTime = item.snoozedUntil ? new Date(item.snoozedUntil).getTime() : null;

        // Se estiver adiado e o tempo de adiamento ainda não chegou, ignora
        if (snoozedTime && snoozedTime > now) continue;

        // Verifica se já atingiu o horário
        const targetTime = snoozedTime || scheduledTime;
        if (targetTime <= now) {
          // Identificador único deste alerta para não disparar em loop a cada 5s
          const alertKey = snoozedTime ? `snooze_${item.snoozedUntil}` : `sched_${item.scheduledAt}`;

          if (item.lastAlertedAt !== alertKey) {
            // Marca como alertado no storage
            item.lastAlertedAt = alertKey;
            reminderService.saveAll(effectiveUserId, currentList);
            setReminders([...currentList]);

            // Dispara som de alerta do lembrete (temático se houver)
            const theme = getThemeById(item.themeId);
            playThemeSound(theme ? theme.soundEffect : 'CHIME');

            // Dispara notificação nativa se o navegador permitir
            notificationService.notify(
              `⏰ Lembrete: ${item.title}`,
              item.clientName ? `@${item.clientName} - ${item.description || 'Horário atingido!'}` : (item.description || 'Horário atingido!'),
              () => {
                window.focus();
                setActiveAlertReminder(item);
              }
            );

            // Abre o modal de alerta na tela!
            setActiveAlertReminder(item);
            break; // Abre um por vez
          }
        }
      }
    };

    // Checa imediatamente e a cada 5 segundos
    checkScheduledReminders();
    const interval = window.setInterval(checkScheduledReminders, 5000);

    return () => clearInterval(interval);
  }, [effectiveUserId]);

  // Contadores
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const dueCount = reminders.filter(r => {
    if (r.status === 'COMPLETED') return false;
    return r.dueDate <= todayStr;
  }).length;

  const overdueCount = reminders.filter(r => {
    if (r.status === 'COMPLETED') return false;
    return new Date(r.scheduledAt).getTime() < Date.now();
  }).length;

  // Ações
  const createReminder = (data: ReminderFormData) => {
    const item = reminderService.createReminder(effectiveUserId, data);
    reloadReminders();
    setIsFormOpen(false);
    return item;
  };

  const updateReminder = (id: string, patch: Partial<ReminderItem>) => {
    const item = reminderService.updateReminder(effectiveUserId, id, patch);
    reloadReminders();
    setIsFormOpen(false);
    setEditingReminder(null);
    return item;
  };

  const toggleComplete = (id: string) => {
    const item = reminderService.toggleComplete(effectiveUserId, id);
    reloadReminders();
    if (activeAlertReminder?.id === id) {
      setActiveAlertReminder(null);
    }
    return item;
  };

  const snooze = (id: string, minutes: number) => {
    const item = reminderService.snooze(effectiveUserId, id, minutes);
    reloadReminders();
    if (activeAlertReminder?.id === id) {
      setActiveAlertReminder(null);
    }
    return item;
  };

  const deleteReminder = (id: string) => {
    const res = reminderService.deleteReminder(effectiveUserId, id);
    reloadReminders();
    if (activeAlertReminder?.id === id) {
      setActiveAlertReminder(null);
    }
    return res;
  };

  const openCreate = () => {
    setEditingReminder(null);
    setIsFormOpen(true);
  };

  const openEdit = (item: ReminderItem) => {
    setEditingReminder(item);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingReminder(null);
  };

  const triggerAlertPreview = (item: ReminderItem) => {
    const theme = getThemeById(item.themeId);
    playThemeSound(theme ? theme.soundEffect : 'CHIME');
    setActiveAlertReminder(item);
  };

  return {
    reminders,
    dueCount,
    overdueCount,
    isManagerOpen,
    setIsManagerOpen,
    isFormOpen,
    editingReminder,
    activeAlertReminder,
    setActiveAlertReminder,
    createReminder,
    updateReminder,
    toggleComplete,
    snooze,
    deleteReminder,
    openCreate,
    openEdit,
    closeForm,
    triggerAlertPreview,
    reloadReminders,
  };
};
