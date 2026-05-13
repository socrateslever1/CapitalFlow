import { useState, useEffect } from 'react';
import { campaignRealtimeService } from '../services/campaignRealtime.service';
import { notificationService } from '../services/notification.service';
import { UserProfile } from '../types';

export const useCampaignNotifications = (activeUser: UserProfile | null) => {
  const [unreadCampaignCount, setUnreadCampaignCount] = useState(0);

  useEffect(() => {
    if (!activeUser) return;

    // Load initial count
    const saved = localStorage.getItem('unreadCampaignCount');
    if (saved) setUnreadCampaignCount(parseInt(saved));

    const cleanup = campaignRealtimeService.startCampaignNotifications({
        onNewLead: (lead) => {
            setUnreadCampaignCount(prev => {
                const newVal = prev + 1;
                localStorage.setItem('unreadCampaignCount', newVal.toString());
                return newVal;
            });
            notificationService.notify('Novo Lead!', `Novo lead cadastrado: ${lead.name || 'Sem nome'}`);
        },
        onNewMessage: (msg) => {
            setUnreadCampaignCount(prev => {
                const newVal = prev + 1;
                localStorage.setItem('unreadCampaignCount', newVal.toString());
                return newVal;
            });
            notificationService.notify('Nova Mensagem de Campanha', msg.message || 'Nova mensagem');
        }
    });

    return cleanup;
  }, [activeUser?.id]);

  const clearUnread = () => {
    setUnreadCampaignCount(0);
    localStorage.setItem('unreadCampaignCount', '0');
  };

  return { unreadCampaignCount, clearUnread };
};
