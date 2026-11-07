package com.socrateslever.capitalflow;

import android.content.Intent;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "WalletBankNotifications")
public final class WalletBankNotificationsPlugin extends Plugin {
    private static volatile WalletBankNotificationsPlugin active;
    private String profileId;

    @Override
    public void load() {
        active = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (active == this) active = null;
        super.handleOnDestroy();
    }

    static void notifyPendingChanged() {
        WalletBankNotificationsPlugin current = active;
        if (current != null && current.getActivity() != null) current.getActivity().runOnUiThread(
            () -> current.notifyListeners("pendingChanged", new JSObject()));
    }

    private boolean listenerGranted() {
        return NotificationManagerCompat.getEnabledListenerPackages(getContext())
            .contains(getContext().getPackageName());
    }

    private void requireProfile(PluginCall call) {
        if (profileId == null || profileId.isEmpty()) throw new SecurityException("Sessão necessária.");
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        try {
            String id = call.getString("profileId");
            if (id != null && !id.matches("(?i)[a-f0-9-]{36}")) {
                call.reject("Identificação de sessão inválida.");
                return;
            }
            WalletBankNotificationStore.setProfile(getContext(), id);
            profileId = id;
            call.resolve(new JSObject().put("active", id != null));
        } catch (Exception error) { call.reject("Não foi possível configurar a sessão."); }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            requireProfile(call);
            JSObject value = new JSObject();
            value.put("permissionGranted", listenerGranted());
            value.put("enabled", WalletBankNotificationStore.enabled(getContext()));
            JSArray packages = new JSArray();
            for (String pkg : WalletBankNotificationStore.packages(getContext())) packages.put(pkg);
            value.put("packages", packages);
            JSArray banks = new JSArray();
            for (int i = 0; i < WalletBankNotificationStore.PACKAGE_IDS.length; i++) {
                banks.put(new JSObject().put("id", WalletBankNotificationStore.PACKAGE_IDS[i])
                    .put("label", WalletBankNotificationStore.PACKAGE_LABELS[i]));
            }
            value.put("availableBanks", banks);
            call.resolve(value);
        } catch (Exception error) { call.reject("Não foi possível consultar a configuração."); }
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        try {
            requireProfile(call);
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) { call.reject("Não foi possível abrir a autorização do Android."); }
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        try {
            requireProfile(call);
            Boolean enabled = call.getBoolean("enabled");
            if (enabled == null) { call.reject("Informe a opção de ativação."); return; }
            WalletBankNotificationStore.setEnabled(getContext(), enabled);
            call.resolve(new JSObject().put("enabled", WalletBankNotificationStore.enabled(getContext())));
        } catch (Exception error) { call.reject("Não foi possível alterar a captura."); }
    }

    @PluginMethod
    public void setAllowedBanks(PluginCall call) {
        try {
            requireProfile(call);
            JSArray selected = call.getArray("packages");
            if (selected == null) { call.reject("Selecione os aplicativos autorizados."); return; }
            Set<String> packages = new HashSet<>();
            for (int i = 0; i < selected.length(); i++) {
                String pkg = selected.optString(i, "");
                if (WalletBankNotificationStore.label(pkg) == null) {
                    call.reject("Aplicativo financeiro não reconhecido."); return;
                }
                packages.add(pkg);
            }
            WalletBankNotificationStore.setPackages(getContext(), packages);
            call.resolve();
        } catch (Exception error) { call.reject("Não foi possível configurar os bancos."); }
    }

    @PluginMethod
    public void listPending(PluginCall call) {
        try {
            requireProfile(call);
            call.resolve(new JSObject().put("items", WalletBankNotificationStore.pending(getContext(), profileId)));
        } catch (Exception error) { call.reject("Não foi possível recuperar as notificações."); }
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        try {
            requireProfile(call);
            String id = call.getString("id");
            if (id == null || !id.matches("[a-f0-9]{64}")) { call.reject("Notificação inválida."); return; }
            WalletBankNotificationStore.dismiss(getContext(), profileId, id);
            call.resolve();
        } catch (Exception error) { call.reject("Não foi possível dispensar a notificação."); }
    }

    @PluginMethod
    public void clearPending(PluginCall call) {
        try {
            requireProfile(call);
            WalletBankNotificationStore.clear(getContext(), profileId);
            call.resolve();
        } catch (Exception error) { call.reject("Não foi possível limpar as sugestões."); }
    }
}
