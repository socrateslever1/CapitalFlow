import React, { ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack?: string;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    message: ''
  };

  public props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: any): State {
    console.error('AppErrorBoundary: Caught error', err);
    return {
      hasError: true,
      message: String(err?.message || err || 'Erro desconhecido'),
      stack: String(err?.stack || '')
    };
  }

  componentDidCatch(err: any) {
    try {
      localStorage.setItem(
        'cm_last_boot_error',
        JSON.stringify({
          message: String(err?.message || err),
          stack: String(err?.stack || ''),
          timestamp: new Date().toISOString()
        })
      );
    } catch {}
  }

  private async clearBrowserStateAndReload() {
    try {
      localStorage.clear();
      sessionStorage.clear();

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } finally {
      const url = new URL(location.href);
      url.searchParams.set('cache_reset', Date.now().toString());
      location.replace(url.toString());
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          minHeight: '100vh', 
          background: '#020617', 
          color: '#e2e8f0', 
          padding: 24, 
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          <div style={{ 
            maxWidth: 600, 
            width: '100%',
            background: '#0b1220',
            padding: 40,
            borderRadius: 32,
            border: '1px solid #1e293b',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ 
              width: 64, 
              height: 64, 
              background: '#ef444420', 
              borderRadius: 20, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 24px',
              color: '#ef4444'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: 'white', letterSpacing: '-0.025em' }}>
              Falha na Inicialização
            </h1>
            
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
              {this.state.message?.includes('Configuração do Supabase ausente') 
                ? 'As variáveis de ambiente do Supabase não foram detectadas. Verifique as configurações no painel do Cloudflare Pages.'
                : 'Ocorreu um erro inesperado ao carregar a aplicação. Tente recarregar a página, tentar novamente ou limpar o cache.'}
            </p>

            <div style={{
              textAlign: 'left',
              background: '#020617',
              padding: 16,
              borderRadius: 16,
              marginBottom: 24,
              border: '1px solid #1e293b',
              maxHeight: 200,
              overflow: 'auto'
            }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
                Detalhes Técnicos:
              </p>
              <pre style={{
                whiteSpace: 'pre-wrap',
                fontSize: 11,
                lineHeight: 1.5,
                color: '#64748b',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
              }}>
                {this.state.message}
                {"\n\n"}
                {this.state.stack || ''}
              </pre>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                style={{
                  flex: 1,
                  minWidth: 130,
                  padding: '14px 18px',
                  borderRadius: 16,
                  background: '#2563eb',
                  color: 'white',
                  fontWeight: 800,
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 13,
                  transition: 'all 0.2s'
                }}
                onClick={() => this.setState({ hasError: false, message: '' })}
              >
                Tentar Novamente
              </button>
              <button
                style={{
                  flex: 1,
                  minWidth: 130,
                  padding: '14px 18px',
                  borderRadius: 16,
                  background: '#334155',
                  color: 'white',
                  fontWeight: 800,
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 13,
                  transition: 'all 0.2s'
                }}
                onClick={() => location.reload()}
              >
                Recarregar
              </button>
              <button
                style={{
                  padding: '14px 18px',
                  borderRadius: 16,
                  background: '#1e293b',
                  color: '#94a3b8',
                  fontWeight: 800,
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 13
                }}
                onClick={() => void this.clearBrowserStateAndReload()}
              >
                Limpar Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children || null;
  }
}
