import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export const SetupPasswordPage = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite_token');

    if (token) {
      // 1. Salva no storage para o AuthScreen pegar
      localStorage.setItem('cm_invite_token', token);
      
      // 2. Redireciona para a raiz mantendo o token na URL para garantia total
      window.location.replace(`/?invite_token=${token}`);
    } else {
      window.location.replace('/');
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <Loader2 className="animate-spin text-blue-500" size={48}/>
        <p className="font-black uppercase text-xs tracking-widest animate-pulse">Sincronizando convite...</p>
    </div>
  );
};