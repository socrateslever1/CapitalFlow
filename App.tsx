// src/App.tsx
import React, { useEffect, lazy, Suspense, useCallback, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { NavHubController } from './layout/NavHubController';
import { AppGate } from './components/AppGate';
import { useAuth } from './features/auth/useAuth';
import { useToast } from './hooks/useToast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState } from './hooks/useAppState';
import { useUiState } from './hooks/useUiState';
import { usePortalRouting } from './hooks/usePortalRouting';
import { usePersistedTab } from './hooks/usePersistedTab';
import { useControllers } from './hooks/useControllers';
import { useAppNotifications } from './hooks/useAppNotifications';
import { useExitGuard } from './hooks/useExitGuard';
import { useNavigationStack } from './hooks/useNavigationStack';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';

import { notificationService } from './services/notification.service';
import { pushSubscriptionService } from './services/pushSubscription.service';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { isDev } from './utils/isDev';
import { Agreement, AgreementInstallment, LedgerEntry, Loan } from './types';
import { agreementService } from './features/agreements/services/agreementService';
import { ModalProvider } from './contexts/ModalContext';
import { ModalHost } from './components/modals/ModalHost';
import { filesService } from './services/files.service';
import { contractsService } from './services/contracts.service';

// Lazy loading components for optimization
import { DashboardContainer } from './containers/DashboardContainer';
import { ClientsContainer } from './containers/ClientsContainer';
import { SourcesContainer } from './containers/SourcesContainer';
import ProfileContainer from '@/containers/ProfileContainer';
import { LegalContainer } from './containers/LegalContainer';

import OperatorSupportChat from './features/support/OperatorSupportChat';
import CalendarView from './features/calendar/CalendarView';
import { SimulatorPanel } from './features/simulator/SimulatorPanel';
import { FlowModal } from './components/modals/FlowModal';

import { TeamPage } from './pages/TeamPage';
import { InvitePage } from './pages/InvitePage';
import { SetupPasswordPage } from './pages/SetupPasswordPage';
import { CustomerAcquisitionPage } from './pages/Comercial/CaptacaoClientes';
import { ReportsPage } from './features/reports/pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ContractDetailsPage } from './pages/ContractDetailsPage';
import { DossierPage } from './pages/DossierPage';

import { PublicCampaignPage } from './pages/Public/PublicCampaignPage';
import { PublicSignaturePage } from './pages/Public/PublicSignaturePage';

export const App: React.FC = () => {
  const [operatorUploadStatus, setOperatorUploadStatus] = useState<{
    state: 'IDLE' | 'UPLOADING' | 'SUCCESS' | 'ERROR';
    message: string;
  }>({ state: 'IDLE', message: '' });
  if (isDev) console.log('[App] Component body execution started');
  // ✅ SEMPRE calcular params, mas NÃO dar return antes dos hooks
  const urlParams = new URLSearchParams(window.location.search);
  const campaignId = urlParams.get('campaign_id');
  const legalSignTokenParam = urlParams.get('legal_sign');
  const rawPortalTokenParam = urlParams.get('portal');
  const rawPortalCodeParam = urlParams.get('portal_code') || urlParams.get('code');
  const hasPortalAccessParams = !!rawPortalTokenParam && !!rawPortalCodeParam;

  // ✅ Hooks SEMPRE no topo (regra do React)
  const { portalToken, portalCode, legalSignToken: legalSignTokenFromHook } = usePortalRouting();
  const { toast, showToast, clearToast } = useToast();

  const {
    activeProfileId,
    loginUser,
    setLoginUser,
    loginPassword,
    setLoginPassword,
    savedProfiles,
    submitLogin,
    submitTeamLogin,
    handleLogout,
    handleSelectSavedProfile,
    handleRemoveSavedProfile,
    bootFinished,
    isLoading: authLoading,
    loadError: authLoadError,
    reauthenticate,
  } = useAuth();

  const {
    loans,
    setLoans,
    clients,
    setClients,
    sources,
    setSources,
    activeUser,
    setActiveUser,
    staffMembers,
    systemUsers,
    selectedStaffId,
    setSelectedStaffId,
    isLoadingData,
    setIsLoadingData,
    fetchFullData,
    activeTab,
    setActiveTab,
    statusFilter,
    setStatusFilter,
    sortOption,
    setSortOption,
    searchTerm,
    setSearchTerm,
    clientSearchTerm,
    setClientSearchTerm,
    profileEditForm,
    setProfileEditForm,
    loadError,
    setLoadError,
    navOrder,
    hubOrder,
    saveNavConfig,
  } = useAppState(activeProfileId, handleLogout);

  const ui = useUiState() as any;
  ui.sortOption = sortOption;
  ui.setSortOption = setSortOption;
  ui.staffMembers = staffMembers;

  const routerNavigate = useNavigate();
  const location = useLocation();

  const handleSetActiveTab = useCallback((tab: any) => {
    if (window.location.pathname !== '/' && tab !== 'CONTRACT_DETAILS' && tab !== 'LEGAL') {
      routerNavigate('/');
    }
    setActiveTab(tab);
  }, [setActiveTab, routerNavigate]);

  const openNavHub = useCallback(() => ui.setShowNavHub(true), [ui.setShowNavHub]);
  const { goBack, isInHub } = useNavigationStack(activeTab, handleSetActiveTab, openNavHub);

  // ✅ Prevenção de loop: evita que a página de contrato seja reaberta após fechar manual
  const processedPathRef = useRef('');

  const isInvitePath =
    window.location.pathname === '/invite' || window.location.pathname === '/setup-password';

  const contractMatch = location.pathname.match(/^\/contrato\/([a-f0-9-]+)$/i);
  const contractIdFromUrl = contractMatch ? contractMatch[1] : null;

  const legalMatch = location.pathname.match(/^\/legal\/editor\/([a-f0-9-]+)$/i);
  const legalIdFromUrl = legalMatch ? legalMatch[1] : null;

  // ✅ token público de assinatura vem ou do hook (portal) ou do querystring
  const legalSignToken = legalSignTokenParam || legalSignTokenFromHook;

  // ✅ view pública: portalToken OU rota pública de campanha OU assinatura pública
  const isPublicView = hasPortalAccessParams || !!portalToken || !!campaignId || !!legalSignToken;

  useEffect(() => {
    // Se o path já foi processado ou é o mesmo, ignora (evita loop ao fechar)
    if (location.pathname === processedPathRef.current) return;

    if (contractIdFromUrl && activeTab !== 'CONTRACT_DETAILS') {
      processedPathRef.current = location.pathname;
      ui.setSelectedLoanId(contractIdFromUrl);
      handleSetActiveTab('CONTRACT_DETAILS');
    } else if (legalIdFromUrl) {
      processedPathRef.current = location.pathname;
      ui.setSelectedLoanId(legalIdFromUrl);
      if (activeTab !== 'LEGAL') {
        handleSetActiveTab('LEGAL');
      }
    } else if (!contractIdFromUrl && !legalIdFromUrl) {
      // Se limpou o path manualmente ou via back, e ainda estava na aba de detalhes, volta pro dashboard
      if (activeTab === 'CONTRACT_DETAILS' || activeTab === 'LEGAL') {
        handleSetActiveTab('DASHBOARD');
      }
      processedPathRef.current = location.pathname;
    }
  }, [contractIdFromUrl, legalIdFromUrl, activeTab, handleSetActiveTab, location.pathname]);

  const navigate = (path: string) => {
    routerNavigate(path);
  };

  usePersistedTab(activeTab, handleSetActiveTab);

  const controllers = useControllers(
    activeUser,
    ui,
    loans,
    setLoans,
    clients,
    setClients,
    sources,
    setSources,
    setActiveUser,
    setIsLoadingData,
    fetchFullData,
    () => Promise.resolve(),
    handleLogout,
    showToast,
    profileEditForm,
    setProfileEditForm
  );

  const { loanCtrl, clientCtrl, sourceCtrl, profileCtrl, paymentCtrl, fileCtrl, aiCtrl, adminCtrl } =
    controllers;

  const handleOpenClientFromDashboard = useCallback((clientId: string | null | undefined, clientName: string) => {
    const client = (clients as any[]).find((item: any) => item.id === clientId)
      || (clients as any[]).find((item: any) => String(item.name || item.nome || '').trim().toLowerCase() === String(clientName || '').trim().toLowerCase());
    const clientAny = client as any;

    setClientSearchTerm(clientAny?.name || clientAny?.nome || clientName || '');
    handleSetActiveTab('CLIENTS');

    if (client) {
      setTimeout(() => clientCtrl.openClientModal(client), 0);
    } else {
      showToast('Cliente nao encontrado no cadastro.', 'warning');
    }
  }, [clients, clientCtrl, handleSetActiveTab, setClientSearchTerm, showToast]);

  const { notifications, removeNotification, addNotification } = useAppNotifications({
    loans,
    sources,
    activeUser,
    showToast,
    setActiveTab,
    setSelectedLoanId: ui.setSelectedLoanId,
    onDataChanged: () => {
      if (activeProfileId) fetchFullData(activeProfileId);
    },
    disabled: isPublicView,
  });

  const handleOperatorFileUpload = useCallback(async (
    file: File | undefined,
    kind: 'PROMISSORIA' | 'CONFISSAO',
    input?: HTMLInputElement | null
  ) => {
    if (!file) return;

    setOperatorUploadStatus({
      state: 'UPLOADING',
      message: `Enviando ${kind === 'PROMISSORIA' ? 'promissoria' : 'documento'}...`,
    });

    const result = kind === 'PROMISSORIA'
      ? await filesService.handlePromissoriaUpload(file, activeUser, String(ui?.promissoriaUploadLoanId), showToast, fetchFullData)
      : await filesService.handleExtraDocUpload(file, activeUser, String(ui?.extraDocUploadLoanId), 'CONFISSAO', showToast, fetchFullData);

    if (input) input.value = '';

    setOperatorUploadStatus({
      state: result?.success ? 'SUCCESS' : 'ERROR',
      message: result?.success ? 'Arquivo carregado com sucesso.' : (result?.message || 'Falha ao carregar arquivo.'),
    });

    window.setTimeout(() => {
      setOperatorUploadStatus((current) => (
        current.state === 'UPLOADING' ? current : { state: 'IDLE', message: '' }
      ));
    }, 3500);
  }, [activeUser, fetchFullData, showToast, ui?.extraDocUploadLoanId, ui?.promissoriaUploadLoanId]);

  useExitGuard(activeUser, activeTab, setActiveTab, isPublicView, showToast, ui);

  useEffect(() => {
    if (activeUser && !isPublicView) {
      notificationService.requestPermission().then((granted) => {
        if (granted) {
          void pushSubscriptionService.register(activeUser.id);
        }
      });
    }
  }, [activeUser, isPublicView]);

  // ✅ MONITOR DE CONEXÃO: Tenta processar fila de escrita quando a rede volta
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[NETWORK] Conexão restabelecida. Processando fila de sincronização...');
      try {
        const { syncService } = await import('./services/sync.service');
        await syncService.processQueue();
      } catch (e) {
        console.error('[NETWORK] Falha ao processar fila após volta da rede:', e);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Timeout de Segurança para o Loading (10 segundos)
  useEffect(() => {
    if (activeProfileId && !activeUser && bootFinished && !loadError) {
      const timer = setTimeout(() => {
        if (!activeUser && !loadError) {
          setLoadError('Tempo limite de sincronização excedido. Verifique sua conexão ou tente reconectar.');
          if (isDev) console.error('[BOOT] Timeout atingido tentando carregar perfil:', activeProfileId);
        }
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [activeProfileId, activeUser, bootFinished, loadError, setLoadError]);

  const effectiveSelectedStaffId =
    activeUser && (activeUser.accessLevel === 'OPERATOR' || (activeUser as any).accessLevel === 2) ? activeUser.id : selectedStaffId;

  const isInitializing = !bootFinished || (!!activeProfileId && !activeUser && !loadError);

  if (isDev) {
    console.log('[APP_STATE]', {
      bootFinished,
      activeProfileId: !!activeProfileId,
      activeUser: !!activeUser,
      loadError,
      authLoadError,
      isInitializing,
      path: window.location.pathname,
      isPublicView,
      legalSignToken: !!legalSignToken
    });
  }

  // ✅ Agora SIM pode retornar rotas públicas (depois dos hooks)
  if (campaignId) return (
    <Suspense fallback={<LoadingScreen />}>
      <PublicCampaignPage />
    </Suspense>
  );
  if (legalSignToken) return (
    <Suspense fallback={<LoadingScreen />}>
      <PublicSignaturePage />
    </Suspense>
  );

  if (hasPortalAccessParams && portalToken === null) {
    return <LoadingScreen />;
  }

  if (isInitializing && !isPublicView && !isInvitePath) {
    return <LoadingScreen />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Toaster
        theme="dark"
        position="top-right"
        expand={false}
        visibleToasts={3}
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            fontSize: '13px',
            borderRadius: '12px',
          },
        }}
        mobileOffset={{ bottom: '80px' }}
      />
      {/*
        AGENDA VIEW - REMOVIDA TEMPORARIAMENTE
        {activeTab === 'AGENDA' && (
          <motion.div
            key="agenda-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CalendarView
              activeUser={activeUser}
              showToast={showToast}
              onClose={goBack}
              isStealthMode={ui.isStealthMode}
              onSystemAction={(type, meta) => {
                // ... logic kept for reference
              }}
            />
          </motion.div>
        )}
      */}
      {isInvitePath ? (
        <>
          {window.location.pathname === '/invite' && <InvitePage />}
          {window.location.pathname === '/setup-password' && <SetupPasswordPage />}
        </>
      ) : (
        <ModalProvider
          activeModal={ui?.activeModal}
          openModal={ui?.openModal}
          closeModal={ui?.closeModal}
          ui={ui}
          activeUser={activeUser}
          clients={clients}
          sources={sources}
          loans={loans}
          isLoadingData={isLoadingData || authLoading}
          loanCtrl={loanCtrl}
          clientCtrl={clientCtrl}
          sourceCtrl={sourceCtrl}
          paymentCtrl={paymentCtrl}
          profileCtrl={profileCtrl}
          adminCtrl={adminCtrl}
          fileCtrl={fileCtrl}
          aiCtrl={aiCtrl}
          showToast={showToast}
          fetchFullData={fetchFullData}
          handleLogout={handleLogout}
        >
          <AppGate
            portalToken={portalToken}
            portalCode={portalCode}
            legalSignToken={legalSignToken}
            activeProfileId={activeProfileId}
            activeUser={activeUser}
            isLoadingData={isLoadingData || authLoading}
            loadError={loadError || authLoadError}
            loginUser={loginUser}
            setLoginUser={setLoginUser}
            loginPassword={loginPassword}
            setLoginPassword={setLoginPassword}
            submitLogin={() => submitLogin(showToast)}
            submitTeamLogin={(params, toastArg) => submitTeamLogin(params, toastArg)}
            savedProfiles={savedProfiles}
            handleSelectSavedProfile={handleSelectSavedProfile}
            handleRemoveSavedProfile={handleRemoveSavedProfile}
            showToast={showToast}
            setIsLoadingData={setIsLoadingData}
            toast={toast}
            reauthenticate={reauthenticate}
            onReauthSuccess={() => {
              setLoadError(null);
              if (activeProfileId) fetchFullData(activeProfileId);
            }}
            handleLogout={handleLogout}
          >
            <AppShell
            toast={toast}
            clearToast={clearToast}
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
            activeUser={activeUser}
            isLoadingData={isLoadingData}
            onOpenNav={() => ui.setShowNavHub(true)}
            onNewLoan={() => {
              ui.setEditingLoan(null);
              ui.openModal('LOAN_FORM');
            }}
            isStealthMode={ui.isStealthMode}
            toggleStealthMode={() => ui.setIsStealthMode(!ui.isStealthMode)}
            onOpenSupport={() => ui.openModal('SUPPORT_CHAT')}
            navOrder={navOrder}
            onGoBack={goBack}
            isInHub={isInHub}
            title={activeTab === 'CONTRACT_DETAILS' ? loans.find(l => l.id === ui.selectedLoanId)?.debtorName : undefined}
            subtitle={activeTab === 'CONTRACT_DETAILS' ? loans.find(l => l.id === ui.selectedLoanId)?.debtorPhone : undefined}
            notifications={notifications}
            removeNotification={removeNotification}
            addNotification={addNotification}
            onNavigate={navigate}
            activeModal={ui.activeModal}
          >
            {/* Dashboard - Persistente para manter scroll ao voltar de detalhes */}
            <div
              key="dashboard-view"
              className={activeTab === 'DASHBOARD' ? 'block' : 'hidden'}
            >
              <DashboardContainer
                loans={loans}
                sources={sources}
                activeUser={activeUser}
                staffMembers={staffMembers}
                selectedStaffId={effectiveSelectedStaffId}
                setSelectedStaffId={setSelectedStaffId}
                mobileDashboardTab={ui.mobileDashboardTab}
                setMobileDashboardTab={ui.setMobileDashboardTab}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                ui={ui}
                loanCtrl={loanCtrl}
                fileCtrl={fileCtrl}
                showToast={showToast}
                isLoadingData={isLoadingData}
                onRefresh={() => fetchFullData(activeUser?.id || '')}
                onNavigate={navigate}
                onOpenClient={handleOpenClientFromDashboard}
              />
            </div>

            <AnimatePresence>
              {activeTab === 'CLIENTS' && (
                <motion.div
                  key="clients-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <ClientsContainer
                    clients={clients}
                    loans={loans}
                    clientSearchTerm={clientSearchTerm}
                    setClientSearchTerm={setClientSearchTerm}
                    clientCtrl={clientCtrl}
                    loanCtrl={loanCtrl}
                    showToast={showToast}
                    ui={ui}
                    isStealthMode={ui.isStealthMode}
                  />
                </motion.div>
              )}

              {activeTab === 'DOSSIER' && (
                <motion.div
                  key="dossier-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <DossierPage
                    loans={loans}
                    clients={clients}
                    activeUser={activeUser}
                    isStealthMode={ui.isStealthMode}
                    onOpenLoan={(loanId) => {
                      ui.setSelectedLoanId(loanId);
                      navigate(`/contrato/${loanId}`);
                    }}
                    onOpenLegal={(loanId) => navigate(`/legal/editor/${loanId}`)}
                    onOpenSimulator={() => handleSetActiveTab('SIMULATOR')}
                    onRenegotiate={(loan) => {
                      ui.setRenegotiationModalLoans([loan]);
                      ui.openModal('RENEGOTIATION', loan);
                    }}
                    showToast={showToast}
                  />
                </motion.div>
              )}

              {/* Desativado temporariamente: TEAM
              {activeTab === 'TEAM' && !activeUser?.supervisor_id && (
                <motion.div
                  key="team-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <TeamPage
                    activeUser={activeUser}
                    showToast={showToast}
                    onRefresh={() => fetchFullData(activeUser?.id || '')}
                    ui={ui}
                    goBack={goBack}
                    isStealthMode={ui.isStealthMode}
                  />
                </motion.div>
              )}
              */}

              {activeTab === 'SOURCES' && (
                <motion.div
                  key="sources-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <SourcesContainer
                    loans={loans}
                    sources={sources}
                    ui={ui}
                    sourceCtrl={sourceCtrl}
                    loanCtrl={loanCtrl}
                    goBack={goBack}
                    isStealthMode={ui.isStealthMode}
                    activeUser={activeUser}
                    onRefresh={() => fetchFullData(activeUser?.id || '')}
                  />
                </motion.div>
              )}

              {activeTab === 'PROFILE' && activeUser && (
                <motion.div
                  key="profile-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <ProfileContainer
                    activeUser={activeUser}
                    clients={clients}
                    loans={loans}
                    sources={sources}
                    ui={ui}
                    profileCtrl={profileCtrl}
                    handleLogout={handleLogout}
                    showToast={showToast}
                    profileEditForm={profileEditForm}
                    setProfileEditForm={setProfileEditForm}
                    fileCtrl={fileCtrl}
                    navOrder={navOrder}
                    hubOrder={hubOrder}
                    saveNavConfig={saveNavConfig}
                    goBack={goBack}
                  />
                </motion.div>
              )}

              {activeTab === 'LEGAL' && (
                <motion.div
                  key="legal-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <LegalContainer
                    loans={loans}
                    sources={sources}
                    activeUser={activeUser}
                    ui={ui}
                    loanCtrl={loanCtrl}
                    fileCtrl={fileCtrl}
                    showToast={showToast}
                    onRefresh={() => fetchFullData(activeUser?.id || '')}
                    goBack={goBack}
                    onNavigate={navigate}
                  />
                </motion.div>
              )}

              {activeTab === 'REPORTS' && (
                <motion.div
                  key="reports-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <ReportsPage
                    loans={loans}
                    sources={sources}
                    activeUser={activeUser}
                    isStealthMode={ui.isStealthMode}
                  />
                </motion.div>
              )}

              {/* Desativado temporariamente: ACQUISITION
              {activeTab === 'ACQUISITION' && (
                <motion.div
                  key="acq-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <CustomerAcquisitionPage activeUser={activeUser} goBack={goBack} isStealthMode={ui.isStealthMode} />
                </motion.div>
              )}
              */}

              {/* Removido tab SUPPORT não autorizada */}

              {activeTab === 'SUPPORT' && activeUser && (
                <motion.div
                  key="support-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <OperatorSupportChat activeUser={activeUser} onClose={() => setActiveTab('DASHBOARD')} />
                </motion.div>
              )}

              {activeTab === 'SETTINGS' && (
                <motion.div
                  key="settings-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <SettingsPage />
                </motion.div>
              )}

              {activeTab === 'CONTRACT_DETAILS' && ui.selectedLoanId && (
                <motion.div
                  key="contract-details-view"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <ContractDetailsPage
                    loanId={ui.selectedLoanId}
                    loans={loans}
                    sources={sources}
                    activeUser={activeUser}
                    onBack={() => {
                      if (window.location.pathname.startsWith('/contrato/')) {
                        routerNavigate('/', { replace: true });
                      }
                      goBack();
                    }}
                    onPayment={async (forgive, date, amount, realDate, interest, contextOverride) => {
                      await paymentCtrl.handlePayment(forgive, date, amount, realDate, interest, undefined, undefined, contextOverride);
                    }}
                    isProcessing={ui.isProcessingPayment}
                    onOpenMessage={(l) => {
                      ui.setMessageModalLoan(l);
                      ui.openModal('MESSAGE_HUB');

                      // Marca como cobrado se houver atraso detectado
                      const hasLate = l.installments?.some(i =>
                        i.status !== 'PAID' &&
                        i.status !== 'PAGO' &&
                        new Date(i.dueDate) < new Date()
                      );

                      if (hasLate) {
                        contractsService.markAsBilled(l.id, l.billing_count || 0).then(() => {
                          fetchFullData(activeUser?.id || '');
                        }).catch(err => {
                          if (isDev) console.error('[AUTO_BILL] Erro:', err);
                        });
                      }
                    }}
                    onRenegotiate={(l) => {
                        const loans = Array.isArray(l) ? l : [l];
                        ui.setRenegotiationModalLoans(loans);
                        ui.openModal('RENEGOTIATION', loans[0]);
                    }}
                    onOpenLegalDocument={(l) => navigate(`/legal/editor/${l.id}`)}
                    onExportExtrato={(l) => loanCtrl.handleExportExtrato(l)}
                    onEdit={(l) => { ui.setEditingLoan(l); ui.openModal('LOAN_FORM', l); }}
                    onArchive={(l) => loanCtrl.openConfirmation({
                        type: 'ARCHIVE',
                        target: l,
                        showRefundOption: true,
                        title: 'Arquivar Contrato?',
                        message: 'O contrato sairá da lista ativa, mas poderá ser restaurado depois.'
                    })}
                    onRestore={(l) => loanCtrl.openConfirmation({
                        type: 'RESTORE',
                        target: l,
                        title: 'Restaurar Contrato?',
                        message: 'O contrato voltará para a lista de contratos ativos.'
                    })}
                    onDelete={(l) => loanCtrl.openConfirmation({
                        type: 'DELETE',
                        target: l,
                        showRefundOption: true,
                        title: 'Excluir Permanentemente?',
                        message: 'Todos os dados, parcelas e histórico serão apagados para sempre.'
                    })}
                    onReverseTransaction={loanCtrl.openReverseTransaction}
                    onOpenReceipt={(transaction: LedgerEntry, loan: Loan) => {
                      ui.setShowReceipt({
                        loan,
                        inst: {
                          id: transaction.installmentId || transaction.id,
                          dueDate: transaction.date,
                          amount: Number(transaction.amount || 0),
                          status: 'PAID'
                        },
                        amountPaid: Math.abs(Number(transaction.amount || 0)),
                        type: transaction.type || 'PAYMENT'
                      });
                      ui.openModal('RECEIPT');
                    }}
                    onActivate={loanCtrl.handleActivateLoan}
                    onAgreementPayment={async (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number, forgiveLateFee?: boolean) => {
                      if (!activeUser) return;
                      const paidAmount = Number(amount ?? inst.amount) || 0;
                      try {
                          await agreementService.processPayment(agreement, inst, paidAmount, loan.sourceId, activeUser, forgiveLateFee);
                          showToast("Parcela do acordo recebida!", "success");
                          ui.setShowReceipt({ loan, inst: { ...inst, agreementId: agreement.id }, amountPaid: paidAmount, type: 'AGREEMENT_PAYMENT' });
                          ui.openModal('RECEIPT');
                          fetchFullData(activeUser?.id || '');
                      } catch (e: any) {
                          showToast("Erro ao processar pagamento: " + e.message, "error");
                      }
                    }}
                    onReverseAgreementPayment={async (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => {
                      if (!activeUser) return;
                      try {
                          await agreementService.reversePayment(agreement, inst, activeUser);
                          showToast("Pagamento estornado com sucesso!", "success");
                          fetchFullData(activeUser?.id || '');
                      } catch (e: any) {
                          showToast("Erro ao estornar pagamento: " + e.message, "error");
                      }
                    }}
                    onRefresh={() => fetchFullData(activeUser?.id || '')}
                    onNavigate={navigate}
                    isStealthMode={ui.isStealthMode}
                  />
                </motion.div>
              )}

              {activeTab === 'SIMULATOR' && (
                <motion.div
                  key="sim-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <SimulatorPanel
                    onClose={goBack}
                    activeUser={activeUser}
                    clients={clients}
                    sources={sources}
                    showToast={showToast}
                    fetchFullData={fetchFullData}
                    isStealthMode={ui.isStealthMode}
                  />
                </motion.div>
              )}

              {activeTab === 'AGENDA' && (
                <motion.div
                  key="agenda-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                >
                  <CalendarView
                    activeUser={activeUser}
                    showToast={showToast}
                    onClose={goBack}
                    isStealthMode={ui.isStealthMode}
                    onSystemAction={(type, meta) => {
                      if (type === 'NAVIGATE_CONTRACT' && meta?.loanId) {
                        ui.setSelectedLoanId(meta.loanId);
                        handleSetActiveTab('CONTRACT_DETAILS');
                        return;
                      }
                      if (type === 'PAYMENT' && meta && ui) {
                        ui.setPaymentModal({
                          loan: {
                            id: meta.loanId,
                            debtorName: meta.clientName,
                            debtorPhone: meta.clientPhone,
                            sourceId: meta.sourceId,
                          },
                          inst: { id: meta.installmentId, dueDate: meta.start_time },
                          calculations: { total: meta.amount, principal: meta.amount, interest: 0, lateFee: 0 },
                        });
                        if (ui.openModal) ui.openModal('PAYMENT');
                      }
                      if (type === 'OPEN_CHAT' && meta && ui) {
                        const loan = loans.find((l: any) => l.id === meta.loanId);
                        if (loan) {
                          ui.setMessageModalLoan(loan);
                          ui.openModal('MESSAGE_HUB');
                        }
                      }
                    }}
                  />
                </motion.div>
              )}

              {activeTab === 'FLOW' && activeUser && (
                <motion.div key="flow-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1, ease: 'linear' }}>
                  <FlowModal
                    loans={loans}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <NavHubController ui={ui} setActiveTab={handleSetActiveTab} activeUser={activeUser} hubOrder={hubOrder} />
          </AppShell>
        </AppGate>

        <div className="relative z-[9999]">
          <ModalHost />

            {operatorUploadStatus.state !== 'IDLE' && (
              <div className={`fixed bottom-5 left-1/2 z-[10000] flex -translate-x-1/2 items-center gap-2 rounded-lg border px-4 py-3 text-xs font-black uppercase shadow-2xl ${
                operatorUploadStatus.state === 'UPLOADING'
                  ? 'border-amber-500/30 bg-slate-900 text-amber-300'
                  : operatorUploadStatus.state === 'SUCCESS'
                    ? 'border-emerald-500/30 bg-slate-900 text-emerald-300'
                    : 'border-rose-500/30 bg-slate-900 text-rose-300'
              }`}>
                {operatorUploadStatus.state === 'UPLOADING' && <Loader2 size={16} className="animate-spin" />}
                <span>{operatorUploadStatus.message}</span>
              </div>
            )}

            <input
              type="file"
              ref={ui?.promissoriaFileInputRef}
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(e) => handleOperatorFileUpload(e.target.files?.[0] as File, 'PROMISSORIA', e.currentTarget)}
            />
            <input
              type="file"
              ref={ui?.extraDocFileInputRef}
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(e) => handleOperatorFileUpload(e.target.files?.[0] as File, 'CONFISSAO', e.currentTarget)}
            />
          </div>
        </ModalProvider>
      )}
    </Suspense>
  );
};
