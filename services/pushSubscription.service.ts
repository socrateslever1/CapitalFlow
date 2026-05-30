import { supabase } from '../lib/supabase';

const getPublicKey = () => {
  const env = (import.meta as any).env;
  return String(env?.VITE_WEB_PUSH_PUBLIC_KEY || '').trim();
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export const pushSubscriptionService = {
  isSupported() {
    return typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      !!getPublicKey();
  },

  async register(profileId: string) {
    if (!profileId || !this.isSupported() || Notification.permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(getPublicKey()),
    });

    const json = subscription.toJSON();
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        profile_id: profileId,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'profile_id,endpoint' });

    if (error) {
      console.warn('[Push] Falha ao salvar inscricao push:', error.message);
      return false;
    }

    return true;
  },
};
