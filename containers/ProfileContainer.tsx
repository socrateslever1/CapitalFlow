
import React from 'react';
import { ProfilePage } from '../pages/ProfilePage';
import { UserProfile, Client, Loan, CapitalSource, AppTab } from '../types';
import { filesService } from '../services/files.service';

interface ProfileContainerProps {
  activeUser: UserProfile;
  clients: Client[];
  loans: Loan[];
  sources: CapitalSource[];
  ui: any;
  profileCtrl: any;
  handleLogout: () => void;
  showToast: any;
  profileEditForm: UserProfile | null;
  setProfileEditForm: (val: UserProfile) => void;
  fileCtrl: any;
  navOrder: AppTab[];
  hubOrder: AppTab[];
  saveNavConfig: (nav: AppTab[], hub: AppTab[]) => void;
  goBack?: () => void;
}

const ProfileContainer: React.FC<ProfileContainerProps> = ({
  activeUser, clients, loans, sources, ui, profileCtrl, handleLogout, showToast, profileEditForm, setProfileEditForm, fileCtrl, navOrder, hubOrder, saveNavConfig, goBack
}) => {
  return (
    <ProfilePage 
        activeUser={activeUser} 
        clients={clients}
        loans={loans}
        sources={sources}
        showToast={showToast}
        setDonateModal={(val) => val ? ui.openModal('DONATE') : ui.closeModal()} 
        handleLogout={handleLogout} 
        setResetDataModal={(val) => val ? ui.openModal('RESET_DATA') : ui.closeModal()} 
        handleDeleteAccount={profileCtrl.handleDeleteAccount}
        profileEditForm={profileEditForm} 
        setProfileEditForm={setProfileEditForm} 
        handleSaveProfile={profileCtrl.handleSaveProfile} 
        handlePhotoUpload={profileCtrl.handlePhotoUpload}
        handleRestoreBackup={profileCtrl.handleRestoreBackup}
        handleExportBackup={() => filesService.handleExportBackup(activeUser, clients, loans, sources, showToast)}
        handleImportExcel={fileCtrl.handleFilePick}
        profilePhotoInputRef={ui.profilePhotoInputRef}
        fileInputExcelRef={ui.fileInputExcelRef}
        navOrder={navOrder}
        hubOrder={hubOrder}
        saveNavConfig={saveNavConfig}
        goBack={goBack}
    />
  );
};

export default ProfileContainer;
