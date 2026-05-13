
// src/utils/notifications.ts
import { notificationService } from '../services/notification.service';

export const requestBrowserNotificationPermission = async () => {
  return await notificationService.requestPermission();
};

export const fireBrowserNotification = (title: string, message: string) => {
  notificationService.notify(title, message);
};
  