package com.socrateslever.capitalflow;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Navigation only. No financial payload, foreground service or overlay permission. */
@CapacitorPlugin(name = "WalletQuickAccess", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class WalletQuickAccessPlugin extends Plugin {
    private static final String CHANNEL = "capitalflow_quick_access";
    // A prioridade destacada é opt-in: nunca alterar silenciosamente o canal
    // existente nem contornar bloqueios escolhidos pelo usuário.
    private static final String PROMINENT_CHANNEL = "capitalflow_quick_access_visible_v1";
    private static final String ACTION = "capitalflow.quick.action";
    private static final String OWNER = "capitalflow.quick.owner";
    private static final int NOTIFICATION_ID = 7103;
    private String profileId;
    private String permissionProfile;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("capitalflow_quick_access", 0);
    }
    private boolean permitted() {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            // Um bloqueio deliberado no canal antigo NÃO deve ser contornado
            // pela criação do canal de prioridade opcional.
            NotificationChannel original = manager.getNotificationChannel(CHANNEL);
            if (original != null && original.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
            NotificationChannel selected = manager.getNotificationChannel(activeChannel());
            if (selected != null && selected.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
    }
    private boolean enabled() { return profileId != null && preferences().getBoolean(profileId, false); }
    private boolean prominent() {
        return profileId != null && preferences().getBoolean(profileId + ":prominent", false);
    }
    private String activeChannel() { return prominent() ? PROMINENT_CHANNEL : CHANNEL; }
    private int currentChannelImportance() {
        if (Build.VERSION.SDK_INT < 26) return -1;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null) return -1;
        NotificationChannel channel = manager.getNotificationChannel(activeChannel());
        return channel == null ? -1 : channel.getImportance();
    }
    private JSObject status() {
        return new JSObject().put("active", profileId != null).put("enabled", enabled())
            .put("permissionGranted", permitted()).put("prominent", prominent())
            .put("priorityAvailable", Build.VERSION.SDK_INT >= 26)
            .put("channelImportance", currentChannelImportance());
    }
    private void cancel() { NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID); }
    private PendingIntent target(String action, int requestCode) {
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(ACTION, action);
        intent.putExtra(OWNER, profileId);
        return PendingIntent.getActivity(getContext(), requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private void show() {
        if (!enabled() || !permitted()) { cancel(); return; }
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            String channelId = activeChannel();
            int importance = prominent() ? NotificationManager.IMPORTANCE_DEFAULT : NotificationManager.IMPORTANCE_LOW;
            NotificationChannel channel = new NotificationChannel(channelId,
                prominent() ? "Atalhos em destaque" : "Atalhos de lançamento", importance);
            channel.setDescription("Acesso opcional aos formulários da Carteira");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            manager.createNotificationChannel(channel);
        }
        Notification notification = new NotificationCompat.Builder(getContext(), activeChannel())
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .setContentTitle("Lançamento rápido")
            .setContentText("Escolha uma ação")
            .setContentIntent(target("expense", 7104))
            // Android 7+ normalmente não mostra ícones gráficos nos botões de
            // ação. Os símbolos nos rótulos mantêm a distinção visível.
            .addAction(android.R.drawable.ic_menu_edit, "➖ Lançar gasto", target("expense", 7104))
            .addAction(android.R.drawable.ic_input_add, "➕ Registrar entrada", target("income", 7105))
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOngoing(true).setSilent(!prominent()).setOnlyAlertOnce(true).setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setPriority(prominent() ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_LOW)
            .build();
        NotificationManagerCompat.from(getContext()).notify(NOTIFICATION_ID, notification);
    }
    @PluginMethod
    public void setSession(PluginCall call) {
        String id = call.getString("profileId");
        if (id != null && !id.matches("(?i)[a-f0-9-]{36}")) { call.reject("Sessão inválida."); return; }
        cancel();
        // Clear stale intents on logout/profile switch; keep cold-launch intent until login resolves.
        if (profileId != null && !profileId.equals(id)) {
            getActivity().getIntent().removeExtra(ACTION);
            getActivity().getIntent().removeExtra(OWNER);
        }
        profileId = id;
        try { show(); call.resolve(); }
        catch (Exception error) { call.reject("Não foi possível preparar a notificação."); }
    }
    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }
    @PluginMethod
    public void setEnabled(PluginCall call) {
        if (profileId == null) { call.reject("Sessão autorizada necessária."); return; }
        Boolean enable = call.getBoolean("enabled");
        if (enable == null) { call.reject("Informe a opção de ativação."); return; }
        if (enable && Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            permissionProfile = profileId;
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        applyEnabled(call, enable);
    }
    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (profileId == null || !profileId.equals(permissionProfile)) { call.reject("A sessão mudou. Tente novamente."); return; }
        permissionProfile = null;
        if (!permitted()) { call.reject("Notificações não autorizadas. Ative a permissão nas configurações do Android."); return; }
        applyEnabled(call, true);
    }
    private void applyEnabled(PluginCall call, boolean enable) {
        if (enable && !permitted()) { call.reject("Notificações bloqueadas nas configurações do Android."); return; }
        try {
            preferences().edit().putBoolean(profileId, enable).apply();
            show();
            call.resolve(status());
        } catch (Exception error) { call.reject("Não foi possível alterar a notificação."); }
    }
    @PluginMethod
    public void setProminent(PluginCall call) {
        if (profileId == null) { call.reject("Sessão autorizada necessária."); return; }
        Boolean value = call.getBoolean("prominent");
        if (value == null) { call.reject("Informe a opção de destaque."); return; }
        if (value && Build.VERSION.SDK_INT < 26) {
            call.reject("O destaque exige Android 8 ou superior."); return;
        }
        if (value && !permitted()) {
            call.reject("Notificações bloqueadas. Consulte as configurações do Android."); return;
        }
        if (value && Build.VERSION.SDK_INT >= 26) {
            NotificationChannel priorityChannel = getContext().getSystemService(NotificationManager.class)
                .getNotificationChannel(PROMINENT_CHANNEL);
            if (priorityChannel != null && priorityChannel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                call.reject("O destaque está bloqueado nas configurações do Android."); return;
            }
        }
        final String key = profileId + ":prominent";
        final boolean previous = prominent();
        try {
            preferences().edit().putBoolean(key, value).commit();
            cancel(); // Canal e prioridade não podem ser alterados na notificação já publicada.
            show();
            call.resolve(status());
        } catch (Exception error) {
            preferences().edit().putBoolean(key, previous).commit();
            cancel();
            try { show(); } catch (Exception ignored) { /* Preservar erro original */ }
            call.reject("Não foi possível alterar o destaque.");
        }
    }
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        if (profileId == null) { call.reject("Sessão autorizada necessária."); return; }
        Intent intent;
        if (Build.VERSION.SDK_INT >= 26) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.putExtra(Settings.EXTRA_CHANNEL_ID, activeChannel());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
        }
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(fallback);
                call.resolve();
            } catch (Exception secondError) {
                call.reject("Não foi possível abrir as configurações de notificações.");
            }
        }
    }
    @PluginMethod
    public void consumeAction(PluginCall call) {
        Intent intent = getActivity().getIntent();
        String action = intent.getStringExtra(ACTION);
        String owner = intent.getStringExtra(OWNER);
        intent.removeExtra(ACTION);
        intent.removeExtra(OWNER);
        boolean valid = profileId != null && profileId.equals(owner) && ("expense".equals(action) || "income".equals(action));
        call.resolve(new JSObject().put("action", valid ? action : ""));
    }
}
