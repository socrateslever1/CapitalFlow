const MANUAL_COLLECTION_TRIGGER_URL = 'http://localhost:5678/webhook/capitalflow-manual-collections-trigger';

export async function triggerManualCollection(profileId: string): Promise<boolean> {
  if (!profileId) return false;

  try {
    await fetch(MANUAL_COLLECTION_TRIGGER_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: profileId,
    });
    return true;
  } catch {
    // The item remains PENDING and is recovered by the next trigger for this profile.
    return false;
  }
}
