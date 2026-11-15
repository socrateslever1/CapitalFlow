import { useEffect, useState } from 'react';
import { platformAdminService } from '../services/platformAdmin.service';
import type { UserProfile } from '../types';

/**
 * Resolves real super-admin access from Supabase (with offline fallback).
 */
export function usePlatformAccess(activeUser: UserProfile | null) {
  const [isPlatformSuperAdmin, setIsPlatformSuperAdmin] = useState(false);
  const [isPlatformAccessChecked, setIsPlatformAccessChecked] = useState(false);

  useEffect(() => {
    let active = true;
    setIsPlatformAccessChecked(false);
    if (!activeUser || activeUser.id === 'DEMO') {
      setIsPlatformSuperAdmin(false);
      setIsPlatformAccessChecked(true);
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
        }
      })
      .catch(() => {
        if (active) {
          setIsPlatformSuperAdmin(false);
          setIsPlatformAccessChecked(true);
        }
      });

    return () => {
      active = false;
    };
  }, [activeUser]);

  return { isPlatformSuperAdmin, isPlatformAccessChecked };
}
