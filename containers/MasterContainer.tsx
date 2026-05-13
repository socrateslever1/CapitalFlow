
import React from 'react';
import { MasterPage } from '../pages/MasterPage';

interface MasterContainerProps {
  allUsers: any[];
  ui: any;
  adminCtrl: any;
}

export const MasterContainer: React.FC<MasterContainerProps> = ({ 
  allUsers, ui, adminCtrl 
}) => {
  return (
    <MasterPage 
        allUsers={allUsers} sacSearch={ui.sacSearch} setSacSearch={ui.setSacSearch} setMasterEditUser={ui.setMasterEditUser}
        handleToggleAdmin={adminCtrl.handleToggleAdmin} handleAdminResetPassword={adminCtrl.handleAdminResetPassword}
    />
  );
};
