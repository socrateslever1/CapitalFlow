import { useEffect, useState } from 'react';
import { platformAdminService } from '../services/platformAdmin.service';
import type { UserProfile } from '../types';

/**
 * Resolves real super-admin access from Supabase. Never reuse another profile's result.
 */
export function usePlatformAccess(activeUser: UserProfile | null) {
  const [isPlatformSuperAdmin, setIsPlatformSuperAdmin] = useState(false);
  const [isPlatformAccessChecked, setIsPlatformAccessChecked] = useState(false);
  const [checkedProfile, setCheckedProfile] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setIsPlatformAccessChecked(false);
    if (!activeUser || activeUser.id === 'DEMO') {
      setIsPlatformSuperAdmin(false);
      setIsPlatformAccessChecked(true);
      setCheckedProfile(activeUser?.id || null);
      return () => {
        active = false;
      };
    }

    platformAdminService
      .isSuperAdmin()
      .then((allowed) => {
        if (active) {
          setIsPlatformSuperAdmin(allowed);
          setIsPlatformAccessChecked(true);
          setCheckedProfile(activeUser.id);
        }
      })
      .catch(() => {
        if (active) {
          setIsPlatformSuperAdmin(false);
          setIsPlatformAccessChecked(true);
          setCheckedProfile(activeUser.id);
        }
      });

    return () => {
      active = false;
    };
  }, [activeUser]);

  const currentProfileChecked = checkedProfile === (activeUser?.id || null);
  return { isPlatformSuperAdmin: currentProfileChecked && isPlatformSuperAdmin,
    isPlatformAccessChecked: currentProfileChecked && isPlatformAccessChecked };
}
