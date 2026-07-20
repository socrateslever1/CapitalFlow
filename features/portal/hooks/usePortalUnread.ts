
import { useState, useEffect } from 'react';
import { supabasePortal } from '../../../lib/supabasePortal';

export const usePortalUnread = (
    loanId: string | undefined,
    isChatOpen: boolean,
    portalToken?: string,
    portalCode?: string
) => {
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!loanId || !portalToken || !portalCode || isChatOpen) {
            setUnreadCount(0);
            return;
        }

        const fetchUnread = async () => {
            const { data, error } = await supabasePortal.rpc('portal_support_unread_count', {
                p_token: portalToken,
                p_shortcode: portalCode,
                p_loan_id: loanId,
            });
            if (error) {
                console.warn('[usePortalUnread] Falha ao contar mensagens:', error.message);
                setUnreadCount(0);
                return;
            }
            setUnreadCount(Number(data || 0));
        };

        fetchUnread();

        const interval = window.setInterval(fetchUnread, 10000);

        return () => clearInterval(interval);
    }, [loanId, isChatOpen, portalToken, portalCode]);

    return unreadCount;
};
