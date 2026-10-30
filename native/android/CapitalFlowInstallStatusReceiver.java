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
                    "O Android não forneceu a tela de confirmação da instalação.");
                return;
            }
            try {
                consent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(consent);
            } catch (RuntimeException error) {
                record(context, "ERROR",
                    "Não foi possível apresentar a confirmação do Android: " + error.getClass().getSimpleName());
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
                reason = "A instalação foi cancelada.";
                break;
            case PackageInstaller.STATUS_FAILURE_BLOCKED:
                reason = "Instalação bloqueada pelas permissões ou políticas de segurança do Android.";
                break;
            case PackageInstaller.STATUS_FAILURE_CONFLICT:
                reason = "Conflito com o aplicativo já instalado. Verifique a assinatura do APK.";
                break;
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                reason = "Esta versão do APK não é compatível com o dispositivo.";
                break;
            case PackageInstaller.STATUS_FAILURE_INVALID:
                reason = "O Android rejeitou o conteúdo ou a assinatura do pacote.";
                break;
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                reason = "Espaço insuficiente para instalar a atualização.";
                break;
            default:
                reason = "O instalador do Android falhou (código " + status + ").";
                break;
        }
        String detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        if (detail != null && !detail.trim().isEmpty()) {
            String clean = detail.replaceAll("[\\r\\n\\t]+", " ").trim();
            if (clean.length() > 160) clean = clean.substring(0, 160);
            reason = reason + " Detalhe técnico: " + clean;
        }
        record(context, "ERROR", reason);
    }
}
