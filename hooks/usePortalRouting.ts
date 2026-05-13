
import { useState, useEffect } from 'react';
import { supabasePortal } from '../lib/supabasePortal';
import { portalService } from '../services/portal.service';

const isUUID = (v: string | null) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export const usePortalRouting = () => {
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [portalCode, setPortalCode] = useState<string | null>(null);
  const [legalSignToken, setLegalSignToken] = useState<string | null>(null);

  useEffect(() => {
    const validateAccess = async () => {
        const params = new URLSearchParams(window.location.search);
        const portal = params.get('portal');
        const code = params.get('portal_code') || params.get('code');
        const legalParam = params.get('legal_sign');

        // 1. Validação do Portal (Token + Code)
        if (portal || code) {
            if (!portal || !code) {
                console.error("Portal Access: Missing portal token or security code.");
                setPortalToken('INVALID_ACCESS');
                setPortalCode(null);
                return;
            }

            setPortalToken('VALIDATING');
            setPortalCode(null);
            
            try {
                const { data, error } = await supabasePortal.rpc('validate_portal_access', {
                    p_token: portal,
                    p_shortcode: code
                });

                if (error || data !== true) {
                    setPortalToken('INVALID_ACCESS');
                } else {
                    await portalService.markViewed(portal, code);
                    setPortalToken(portal);
                    setPortalCode(code);
                }
            } catch (e) {
                setPortalToken('PORTAL_UNAVAILABLE');
            }
        }

        // 2. Validação Legal Sign
        if (isUUID(legalParam)) {
            setLegalSignToken(legalParam);
        }

        // 🔐 ATENÇÃO: Desabilitamos a limpeza da URL via window.history.replaceState 
        // para garantir que o componente App.tsx consiga ler o parâmetro logo após o boot.
    };

    validateAccess();
  }, [window.location.search]);

  return { portalToken, portalCode, legalSignToken };
};
