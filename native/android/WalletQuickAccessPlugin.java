package com.socrateslever.capitalflow;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
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
            NotificationChannel channel = getContext().getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
    }
    private boolean enabled() { return profileId != null && preferences().getBoolean(profileId, false); }
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
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Atalhos de lançamento", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Acesso opcional aos formulários da Carteira");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            manager.createNotificationChannel(channel);
        }
        Notification notification = new NotificationCompat.Builder(getContext(), CHANNEL)
            .setSmallIcon(android.R.drawable.ic_input_add)
            .setContentTitle("CapitalFlow · Lançamento rápido")
            .setContentText("Abra o formulário e confirme no aplicativo.")
            .setContentIntent(target("expense", 7104))
            .addAction(android.R.drawable.ic_input_add, "Lançar gasto", target("expense", 7104))
            .addAction(android.R.drawable.ic_input_add, "Registrar entrada", target("income", 7105))
            .setOngoing(true).setSilent(true).setOnlyAlertOnce(true).setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET).setPriority(NotificationCompat.PRIORITY_LOW)
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
        call.resolve(new JSObject().put("active", profileId != null)
            .put("enabled", enabled()).put("permissionGranted", permitted()));
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
            call.resolve(new JSObject().put("active", true).put("enabled", enabled()).put("permissionGranted", permitted()));
        } catch (Exception error) { call.reject("Não foi possível alterar a notificação."); }
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
