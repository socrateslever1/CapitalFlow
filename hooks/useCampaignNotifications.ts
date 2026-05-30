import { useState, useEffect } from 'react';
import { campaignRealtimeService } from '../services/campaignRealtime.service';
import { notificationService } from '../services/notification.service';
import { UserProfile } from '../types';

let activeOwnerId: string | null = null;
let activeCleanup: (() => void) | null = null;
let activeCount = 0;
const listeners = new Set<(count: number) => void>();

const readCount = (ownerId: string) => Number(localStorage.getItem(`unreadCampaignCount:${ownerId}`) || 0);
const writeCount = (ownerId: string, count: number) => localStorage.setItem(`unreadCampaignCount:${ownerId}`, String(count));
const emitCount = (count: number) => listeners.forEach((listener) => listener(count));

export const useCampaignNotifications = (activeUser: UserProfile | null) => {
  const [unreadCampaignCount, setUnreadCampaignCount] = useState(0);

  useEffect(() => {
    if (!activeUser) return;
    const ownerId = activeUser.supervisor_id || activeUser.id;

    setUnreadCampaignCount(readCount(ownerId));
    listeners.add(setUnreadCampaignCount);
    activeCount += 1;

    if (activeOwnerId !== ownerId) {
      activeCleanup?.();
      activeCleanup = null;
      activeOwnerId = ownerId;
    }

    if (!activeCleanup) {
      activeCleanup = campaignRealtimeService.startCampaignNotifications({
        ownerId,
        onNewLead: (lead) => {
          const next = readCount(ownerId) + 1;
          writeCount(ownerId, next);
          emitCount(next);
          notificationService.notify('Novo Lead!', `Novo lead cadastrado: ${lead.nome || lead.name || 'Sem nome'}`);
        },
        onNewMessage: (msg) => {
          const next = readCount(ownerId) + 1;
          writeCount(ownerId, next);
          emitCount(next);
          notificationService.notify('Nova Mensagem de Campanha', msg.message || 'Nova mensagem');
        }
      });
    }

    return () => {
      listeners.delete(setUnreadCampaignCount);
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) {
        activeCleanup?.();
        activeCleanup = null;
        activeOwnerId = null;
      }
    };
  }, [activeUser?.id, activeUser?.supervisor_id]);

  const clearUnread = () => {
    const ownerId = activeUser ? activeUser.supervisor_id || activeUser.id : 'default';
    setUnreadCampaignCount(0);
    writeCount(ownerId, 0);
    emitCount(0);
  };

  return { unreadCampaignCount, clearUnread };
};
