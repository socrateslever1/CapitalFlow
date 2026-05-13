
import { useState, useEffect, useCallback, useRef } from 'react';
import { calendarService } from '../services/calendar.service';
import { CalendarEvent, CalendarViewMode, GoogleIntegration } from '../types';
import { UserProfile } from '../../../types';
import { playNotificationSound } from '../../../utils/notificationSound';
import { notificationService } from '../../../services/notification.service';
import { supabase } from '../../../lib/supabase';

export const useCalendar = (activeUser: UserProfile | null, showToast: (msg: string, type?: any) => void) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('MONTH');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleIntegration | null>(null);
  const [urgentCount, setUrgentCount] = useState(0);
  const notifiedOverdueRef = useRef<Set<string>>(new Set());

  // Load Data
  const refreshEvents = useCallback(async (silent = false) => {
    if (!activeUser) return;
    if (!silent) setIsLoading(true);
    try {
      const ownerId = activeUser.supervisor_id || activeUser.id;
      const [sysEvents, userEvents] = await Promise.all([
        calendarService.fetchSystemEvents(ownerId),
        calendarService.listUserEvents(activeUser.id)
      ]);
      
      const all = [...sysEvents, ...userEvents];
      setEvents(all);
      setUrgentCount(all.filter(e => e.priority === 'HIGH' || e.priority === 'URGENT').length);

    } catch (e) {
      console.error(e);
      if (!silent) showToast("Erro ao carregar agenda", "error");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [activeUser]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  // --- REALTIME LISTENER (INSERT + UPDATE) ---
  useEffect(() => {
    if (!activeUser) return;

    const channel = supabase
      .channel('calendar-realtime-v3')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_intents', filter: `profile_id=eq.${activeUser.id}` },
        (payload) => {
          playNotificationSound();
          showToast('Nova ação do portal!', 'info');
          refreshEvents(true);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payment_intents', filter: `profile_id=eq.${activeUser.id}` },
        () => refreshEvents(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events', filter: `profile_id=eq.${activeUser.id}` },
        () => refreshEvents(true)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'parcelas' },
        () => refreshEvents(true)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contratos', filter: `owner_id=eq.${activeUser.id}` },
        () => refreshEvents(true)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeUser, refreshEvents]);

  // CRUD Wrappers
  const addEvent = async (evt: Partial<CalendarEvent>) => {
    if (!activeUser) return;
    try {
      await calendarService.createEvent(evt, activeUser.id);
      showToast("Lembrete criado!", "success");
      refreshEvents(true);
    } catch (e) { showToast("Erro ao criar", "error"); }
  };

  const updateEvent = async (id: string, evt: Partial<CalendarEvent>) => {
    try {
      await calendarService.updateEvent(id, evt);
      showToast("Atualizado!", "success");
      refreshEvents(true);
    } catch (e) { showToast("Erro ao atualizar", "error"); }
  };

  const deleteEvent = async (id: string) => {
    try {
      await calendarService.deleteEvent(id);
      showToast("Removido.", "success");
      refreshEvents(true);
    } catch (e) { showToast("Erro ao remover", "error"); }
  };

  return {
    events,
    viewMode,
    setViewMode,
    currentDate,
    setCurrentDate,
    isLoading,
    refreshEvents,
    addEvent,
    updateEvent,
    deleteEvent,
    googleStatus,
    urgentCount
  };
};
