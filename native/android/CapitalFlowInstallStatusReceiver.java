package com.socrateslever.capitalflow;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.Build;

/**
 * Explicit, non-exported receiver for the system PackageInstaller callback.
 * It is not a remote command surface: only our app's PendingIntent can reach
 * it, and it never installs or downloads an arbitrary package.
 */
public final class CapitalFlowInstallStatusReceiver extends BroadcastReceiver {
    static final String ACTION = "com.socrateslever.capitalflow.INSTALL_RESULT";
    static final String PREFS = "capitalflow_apk_install_status";

    static void record(Context context, String stage, String message) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("stage", stage)
            .putString("message", message)
            .putLong("updated_at", System.currentTimeMillis())
            .apply();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION.equals(intent.getAction())) return;
        int status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            record(context, "AWAITING_CONFIRMATION",
                "O Android precisa da sua confirmação para concluir a atualização.");
            final Intent consent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                consent = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            } else {
                consent = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            }
            if (consent == null) {
                record(context, "ERROR",
                    "INSTALLATION");
                return;
            }
            try {
                consent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(consent);
            } catch (RuntimeException error) {
                record(context, "ERROR",
                    "INSTALLATION");
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            record(context, "SUCCESS", "Atualização instalada pelo Android.");
            return;
        }
        String reason;
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_ABORTED:
                reason = "INSTALLATION_CANCELLED";
                break;
            case PackageInstaller.STATUS_FAILURE_BLOCKED:
                reason = "INSTALLATION_BLOCKED";
                break;
            case PackageInstaller.STATUS_FAILURE_CONFLICT:
                reason = "INSTALLATION_CONFLICT";
                break;
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                reason = "INSTALLATION_INCOMPATIBLE";
                break;
            case PackageInstaller.STATUS_FAILURE_INVALID:
                reason = "INSTALLATION_INVALID";
                break;
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                reason = "INSTALLATION_STORAGE";
                break;
            default:
                reason = "INSTALLATION_UNKNOWN";
                break;
        }
        String detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        if (detail != null && !detail.trim().isEmpty()) {
            // Only internal logs receive the Android diagnostic. Never surface it.
            android.util.Log.w("CapitalFlowApk", "Installation failed with status " + status + ": " + detail);
        }
        record(context, "ERROR", reason);
    }
}
