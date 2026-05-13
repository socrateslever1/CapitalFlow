import React, { useMemo } from 'react';
import { UnifiedChat } from '../../components/chat/UnifiedChat';
import { createCaptacaoAdapter } from '../../components/chat/adapters/captacaoAdapter';

export const CampanhaChat: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const sessionToken = params.get('session');
  const clientName = params.get('name') || 'Visitante';

  const adapter = useMemo(() => createCaptacaoAdapter('LEAD'), []);

  if (!sessionToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Sessão inválida.
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      <UnifiedChat
        adapter={adapter}
        context={{ sessionToken, clientName }}
        role="LEAD"
        userId="LEAD"
        title="Atendimento CapitalFlow"
        subtitle="Suporte ao Cliente"
      />
    </div>
  );
};
