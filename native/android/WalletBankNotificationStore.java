package com.socrateslever.capitalflow;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Local-only bank notification queue. Raw notification text is NEVER persisted.
 * Opt-in, specific package allowlist, active authenticated profile and an Android
 * system access grant are all necessary before capture.
 */
final class WalletBankNotificationStore {
    static final String[] PACKAGE_IDS = {
        "com.nu.production", "com.c6bank.app", "br.com.intermedium",
        "com.picpay", "com.mercadopago.wallet"
    };
    static final String[] PACKAGE_LABELS = {
        "Nubank", "C6 Bank", "Inter", "PicPay", "Mercado Pago"
    };
    private static final String PREFS = "cf_bank_notification_settings";
    private static final String KEY_ALIAS = "capitalflow_bank_notice_v1";
    private static final String FIELD_QUEUE = "encrypted_pending_v1";
    private static final long RETENTION = 72L * 60L * 60L * 1000L;
    private static final long MAX_AMOUNT_CENTS = 1_000_000_000_00L;
    private static final int MAX_PENDING = 40;
    private static final Pattern AMOUNT = Pattern.compile("R\\$\\s*([0-9]{1,3}(?:\\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2})", Pattern.CASE_INSENSITIVE);
    private static final Pattern PURCHASE = Pattern.compile(
        "compra|comprou|pagamento (efetuado|realizado|aprovado)|pix (enviado|realizado)|transfer[eê]ncia (enviada|realizada)|d[eé]bito (realizado|efetuado)|voc[eê] pagou",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern BLOCKED = Pattern.compile(
        "c[oó]digo|autentica|token|senha|pin\\b|cvv|verifica|login|acesso|recebid[oa]|estorno|reembolso|devolu|saldo|limite|fatura fechada|oferta|promo[cç][aã]o|parcela venc|vence em",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private WalletBankNotificationStore() {}

    static String label(String pkg) {
        for (int i = 0; i < PACKAGE_IDS.length; i++) if (PACKAGE_IDS[i].equals(pkg)) return PACKAGE_LABELS[i];
        return null;
    }

    static String hash(String input) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte b : digest) result.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return result.toString();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void setProfile(Context context, String profile) throws Exception {
        String next = profile == null || profile.isEmpty() ? "" : hash(profile);
        SharedPreferences settings = prefs(context);
        if (!next.equals(settings.getString("profile", ""))) {
            // No notifications may cross authenticated users or a logout.
            settings.edit().putString("profile", next).putBoolean("enabled", false)
                .remove(FIELD_QUEUE).apply();
        }
    }

    static synchronized boolean enabled(Context context) {
        SharedPreferences p = prefs(context);
        return p.getBoolean("enabled", false) && !p.getString("profile", "").isEmpty()
            && !p.getStringSet("packages", java.util.Collections.emptySet()).isEmpty();
    }

    static synchronized void setEnabled(Context context, boolean value) {
        SharedPreferences p = prefs(context);
        boolean allowed = value && !p.getString("profile", "").isEmpty();
        p.edit().putBoolean("enabled", allowed).apply();
    }

    static synchronized void setPackages(Context context, java.util.Set<String> packages) {
        java.util.Set<String> safe = new java.util.HashSet<>();
        for (String pkg : packages) if (label(pkg) != null) safe.add(pkg);
        SharedPreferences.Editor editor = prefs(context).edit().putStringSet("packages", safe);
        if (safe.isEmpty()) editor.putBoolean("enabled", false);
        editor.apply();
    }

    static synchronized java.util.Set<String> packages(Context context) {
        return new java.util.HashSet<>(prefs(context).getStringSet("packages", java.util.Collections.emptySet()));
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }

    private static JSONObject read(Context context) throws Exception {
        String value = prefs(context).getString(FIELD_QUEUE, "");
        if (value == null || value.isEmpty()) return new JSONObject().put("queue", new JSONArray()).put("seen", new JSONArray());
        byte[] all = Base64.decode(value, Base64.NO_WRAP);
        if (all.length < 13) throw new IllegalStateException("Encrypted payload corrupt");
        byte[] iv = java.util.Arrays.copyOfRange(all, 0, 12);
        byte[] ciphertext = java.util.Arrays.copyOfRange(all, 12, all.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        cipher.updateAAD("capitalflow-bank-notifications-v1".getBytes(StandardCharsets.UTF_8));
        return new JSONObject(new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
    }

    private static void write(Context context, JSONObject data) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD("capitalflow-bank-notifications-v1".getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(data.toString().getBytes(StandardCharsets.UTF_8));
        byte[] all = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, all, 0, iv.length);
        System.arraycopy(encrypted, 0, all, iv.length, encrypted.length);
        prefs(context).edit().putString(FIELD_QUEUE, Base64.encodeToString(all, Base64.NO_WRAP)).apply();
    }

    private static JSONObject compact(JSONObject state, long now) throws Exception {
        JSONArray oldQueue = state.optJSONArray("queue");
        JSONArray oldSeen = state.optJSONArray("seen");
        JSONArray queue = new JSONArray();
        JSONArray seen = new JSONArray();
        if (oldQueue != null) for (int i = Math.max(0, oldQueue.length() - MAX_PENDING); i < oldQueue.length(); i++) {
            JSONObject event = oldQueue.optJSONObject(i);
            if (event != null && now - event.optLong("at", 0) < RETENTION
                && now >= event.optLong("at", 0) - 60_000) queue.put(event);
        }
        if (oldSeen != null) for (int i = Math.max(0, oldSeen.length() - 120); i < oldSeen.length(); i++) {
            JSONObject item = oldSeen.optJSONObject(i);
            if (item != null && now - item.optLong("at", 0) < RETENTION) seen.put(item);
        }
        return new JSONObject().put("queue", queue).put("seen", seen);
    }

    static synchronized boolean capture(Context context, String pkg, String keyId,
                                        long timestamp, String title, String message) {
        try {
            if (!enabled(context) || label(pkg) == null || !packages(context).contains(pkg)) return false;
            if (timestamp <= 0 || Math.abs(System.currentTimeMillis() - timestamp) > 10 * 60_000L) return false;
            if (title == null && message == null) return false;
            String raw = ((title == null ? "" : title) + " " + (message == null ? "" : message));
            if (raw.length() > 800) raw = raw.substring(0, 800);
            if (BLOCKED.matcher(raw).find() || !PURCHASE.matcher(raw).find()) return false;
            Matcher match = AMOUNT.matcher(raw);
            if (!match.find()) return false;
            String digits = match.group(1).replace(".", "").replace(",", "");
            long cents = Long.parseLong(digits);
            if (cents <= 0 || cents > MAX_AMOUNT_CENTS) return false;
            String mode = raw.toLowerCase(Locale.ROOT).matches(".*(pix|transfer[eê]ncia|d[eé]bito).*") ? "ACCOUNT" : "CARD";
            String id = hash(pkg + "|" + keyId + "|" + timestamp + "|" + cents);
            JSONObject state = compact(read(context), System.currentTimeMillis());
            JSONArray seen = state.getJSONArray("seen");
            for (int i = 0; i < seen.length(); i++) {
                if (id.equals(seen.optJSONObject(i).optString("id"))) return false;
            }
            JSONArray queue = state.getJSONArray("queue");
            queue.put(new JSONObject().put("id", id).put("packageName", pkg)
                .put("institution", label(pkg)).put("cents", cents).put("mode", mode)
                .put("at", timestamp));
            seen.put(new JSONObject().put("id", id).put("at", timestamp));
            state = compact(state, System.currentTimeMillis());
            write(context, state);
            return true;
        } catch (Exception ignored) { return false; } // fail closed, never log bank content
    }

    static synchronized JSONArray pending(Context context, String profile) throws Exception {
        if (profile == null || profile.isEmpty() ||
            !hash(profile).equals(prefs(context).getString("profile", ""))) return new JSONArray();
        JSONObject state = compact(read(context), System.currentTimeMillis());
        write(context, state);
        return state.getJSONArray("queue");
    }

    static synchronized void dismiss(Context context, String profile, String id) throws Exception {
        if (profile == null || profile.isEmpty() ||
            !hash(profile).equals(prefs(context).getString("profile", ""))) throw new SecurityException("Profile mismatch");
        JSONObject state = compact(read(context), System.currentTimeMillis());
        JSONArray old = state.getJSONArray("queue");
        JSONArray next = new JSONArray();
        for (int i = 0; i < old.length(); i++) {
            JSONObject row = old.optJSONObject(i);
            if (row != null && !id.equals(row.optString("id"))) next.put(row);
        }
        state.put("queue", next);
        write(context, state);
    }

    static synchronized void clear(Context context, String profile) throws Exception {
        if (profile == null || !hash(profile).equals(prefs(context).getString("profile", ""))) {
            throw new SecurityException("Profile mismatch");
        }
        prefs(context).edit().remove(FIELD_QUEUE).apply();
    }
}
