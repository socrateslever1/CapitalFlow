package com.socrateslever.capitalflow;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Android system calls this service only after the user grants Notification Access.
 * The service ignores all apps except the bank packages explicitly chosen by the user.
 */
public final class WalletBankNotificationListenerService extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null || sbn.isOngoing()) return;
        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;
        if (extras == null) return;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence message = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (message == null) message = extras.getCharSequence(Notification.EXTRA_TEXT);
        boolean added = WalletBankNotificationStore.capture(
            getApplicationContext(), sbn.getPackageName(), sbn.getKey(), sbn.getPostTime(),
            title == null ? null : title.toString(), message == null ? null : message.toString());
        if (added) WalletBankNotificationsPlugin.notifyPendingChanged();
    }
}
