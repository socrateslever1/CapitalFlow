package com.socrateslever.capitalflow;

import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.content.IntentSender;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Downloads the official *signed* APK within CapitalFlow (no external browser).
 * Revalidates SHA-256, package identity, versionCode and signing certificate.
 * Installation is staged using PackageInstaller.Session and still requires
 * Android can install a self-update without another confirmation on eligible
 * devices. If it requires a system confirmation, the receiver presents it.
 * All outcomes are reported instead of assuming that launch means success.
 */
@CapacitorPlugin(name = "CapitalFlowApkInstaller")
public final class CapitalFlowApkInstallerPlugin extends Plugin {
    private static final String RELEASE =
        "https://github.com/socrateslever1/CapitalFlow/releases/download/android-signed-beta/CapitalFlow-Android.apk";
    private static final long MAX_BYTES = 150L * 1024L * 1024L;
    private final AtomicBoolean downloading = new AtomicBoolean(false);

    @PluginMethod
    public void consumeInstallStatus(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(
            CapitalFlowInstallStatusReceiver.PREFS, Context.MODE_PRIVATE);
        String stage = prefs.getString("stage", "IDLE");
        String message = prefs.getString("message", "");
        JSObject result = new JSObject();
        result.put("stage", stage);
        result.put("message", message);
        if ("ERROR".equals(stage) || "SUCCESS".equals(stage)) {
            prefs.edit().putString("stage", "IDLE").remove("message").apply();
        }
        call.resolve(result);
    }

    private void recordStatus(String stage, String message) {
        CapitalFlowInstallStatusReceiver.record(getContext(), stage, message);
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        if (!downloading.compareAndSet(false, true)) {
            call.reject("Já existe uma atualização sendo baixada.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !getContext().getPackageManager().canRequestPackageInstalls()) {
            downloading.set(false);
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings);
                call.reject("Autorize a instalação por este aplicativo nas configurações do Android e toque em atualizar novamente.");
            } catch (ActivityNotFoundException e) {
                call.reject("O dispositivo não permite instalar atualizações por este aplicativo.", null, e);
            }
            return;
        }
        recordStatus("DOWNLOADING", "Baixando e verificando o APK oficial.");
        Thread worker = new Thread(() -> {
            File temp = null;
            try {
                File directory = new File(getContext().getCacheDir(), "capitalflow-apk");
                if (!directory.isDirectory() && !directory.mkdirs()) {
                    throw new IllegalStateException("Não foi possível preparar o espaço de atualização.");
                }
                String checksum = downloadChecksum();
                temp = File.createTempFile("download-", ".apk", directory);
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long count = 0;
                HttpURLConnection connection = connect(RELEASE);
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(temp)) {
                    byte[] buffer = new byte[64 * 1024];
                    int bytesRead;
                    while ((bytesRead = input.read(buffer)) != -1) {
                        count += bytesRead;
                        if (count > MAX_BYTES) throw new IllegalStateException("Tamanho do instalador excedeu o limite de segurança.");
                        output.write(buffer, 0, bytesRead);
                        digest.update(buffer, 0, bytesRead);
                    }
                    output.getFD().sync();
                } finally { connection.disconnect(); }
                if (count < 100_000) throw new IllegalStateException("O instalador recebido está incompleto.");
                String actual = toHex(digest.digest());
                if (!actual.equals(checksum)) throw new IllegalStateException("Assinatura de integridade do download inválida.");
                verifyPackageAndCertificate(temp);
                File verified = new File(directory, "CapitalFlow-Android.apk");
                if (verified.exists() && !verified.delete()) {
                    throw new IllegalStateException("Não foi possível substituir o pacote anterior.");
                }
                if (!temp.renameTo(verified)) throw new IllegalStateException("Não foi possível preparar o instalador.");
                temp = null;
                recordStatus("STAGING", "Preparando atualização validada no Android.");
                try {
                    stageAndCommit(verified);
                    JSObject response = new JSObject();
                    response.put("stage", "INSTALLING");
                    call.resolve(response);
                } finally {
                    // The PackageInstaller session has its own sealed copy.
                    if (verified.exists() && !verified.delete()) {
                        android.util.Log.w("CapitalFlowApk", "Verified temporary APK could not be deleted.");
                    }
                }
            } catch (Exception e) {
                recordStatus("ERROR", "Não foi possível preparar a atualização: " + safeError(e));
                call.reject("Falha na atualização: " + safeError(e), null, e);
            } finally {
                if (temp != null) temp.delete();
                downloading.set(false);
            }
        }, "CapitalFlow-SignedApk");
        worker.setDaemon(true);
        worker.start();
    }

    /**
     * Stage the verified package in Android's supported installation API.
     * ACTION_VIEW cannot report installer errors and was previously treated as
     * success merely because the Android installer screen had opened.
     */
    private void stageAndCommit(File verified) throws Exception {
        PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(getContext().getPackageName());
        params.setSize(verified.length());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // User already requested this self-update. Android may install it
            // without another prompt if OS/target/install ownership allows.
            // Otherwise STATUS_PENDING_USER_ACTION triggers standard consent.
            params.setRequireUserAction(
                PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int sessionId = installer.createSession(params);
        boolean committed = false;
        try {
            try (PackageInstaller.Session session = installer.openSession(sessionId)) {
                try (InputStream source = new FileInputStream(verified);
                     OutputStream destination = session.openWrite(
                         "base.apk", 0, verified.length())) {
                    byte[] buffer = new byte[64 * 1024];
                    int length;
                    while ((length = source.read(buffer)) != -1) {
                        destination.write(buffer, 0, length);
                    }
                    session.fsync(destination);
                }
                Intent callback = new Intent(
                    getContext(), CapitalFlowInstallStatusReceiver.class);
                callback.setAction(CapitalFlowInstallStatusReceiver.ACTION);
                callback.putExtra("session_id", sessionId);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                // Android 12+ requires MUTABLE so the system can fill in the
                // result extras. The target intent stays explicit to our receiver.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    flags |= PendingIntent.FLAG_MUTABLE;
                }
                PendingIntent pending = PendingIntent.getBroadcast(
                    getContext(), sessionId, callback, flags);
                recordStatus("INSTALLING",
                    "Atualização enviada ao Android; confirme apenas se solicitado.");
                session.commit(pending.getIntentSender());
                committed = true;
            }
        } finally {
            if (!committed) {
                installer.abandonSession(sessionId);
            }
        }
    }

    private static String safeError(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return error.getClass().getSimpleName();
        }
        // Do not print OS paths or unbounded native errors in the UI.
        return message.length() > 220 ? message.substring(0, 220) : message;
    }

    private static String downloadChecksum() throws Exception {
        HttpURLConnection conn = connect(RELEASE + ".sha256");
        try (InputStream stream = conn.getInputStream()) {
            byte[] bytes = new byte[1024];
            int length = 0, n;
            while (length < bytes.length && (n = stream.read(bytes, length, bytes.length-length)) != -1) {
                length += n;
            }
            String response = new String(bytes, 0, length, StandardCharsets.US_ASCII);
            Matcher match = Pattern.compile("(?i)^\\s*([a-f0-9]{64})(?=\\s|$)").matcher(response);
            if (!match.find()) throw new IllegalStateException("O resumo SHA-256 oficial não está disponível.");
            return match.group(1).toLowerCase(Locale.ROOT);
        } finally {conn.disconnect();}
    }

    private static HttpURLConnection connect(String initial) throws Exception {
        String url = initial;
        for (int i=0; i<6; i++) {
            URL parsed = new URL(url);
            String host = parsed.getHost().toLowerCase(Locale.ROOT);
            if (!"https".equals(parsed.getProtocol()) ||
                !("github.com".equals(host) || host.endsWith(".githubusercontent.com"))) {
                throw new IllegalStateException("Origem do instalador não autorizada.");
            }
            HttpURLConnection connection = (HttpURLConnection) parsed.openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(60_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/octet-stream");
            int status = connection.getResponseCode();
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null) throw new IllegalStateException("Redirecionamento sem destino.");
                url = new URL(parsed, location).toString();
                continue;
            }
            if (status != 200) {
                connection.disconnect();
                throw new IllegalStateException("O servidor recusou o instalador (HTTP " + status + ").");
            }
            long length = connection.getContentLengthLong();
            if (length > MAX_BYTES) {
                connection.disconnect();
                throw new IllegalStateException("Arquivo maior que o permitido.");
            }
            return connection;
        }
        throw new IllegalStateException("Excesso de redirecionamentos ao baixar atualização.");
    }

    private void verifyPackageAndCertificate(File apk) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo downloaded = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (downloaded == null || !getContext().getPackageName().equals(downloaded.packageName)) {
            throw new IllegalStateException("O APK não pertence ao CapitalFlow instalado.");
        }
        PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), flags);
        long nextVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? downloaded.getLongVersionCode() : downloaded.versionCode;
        long currentVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? installed.getLongVersionCode() : installed.versionCode;
        if (nextVersion <= currentVersion) {
            throw new IllegalStateException("Esta atualização não é mais recente que o aplicativo instalado.");
        }
        Signature[] original = signingCertificates(installed);
        Signature[] candidate = signingCertificates(downloaded);
        if (original == null || candidate == null || original.length != 1 || candidate.length != 1 ||
            !MessageDigest.isEqual(original[0].toByteArray(), candidate[0].toByteArray())) {
            throw new IllegalStateException("O APK não possui o certificado oficial desta instalação.");
        }
    }

    private static Signature[] signingCertificates(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        }
        return info.signatures;
    }

    private static String toHex(byte[] data) {
        StringBuilder hex = new StringBuilder(data.length * 2);
        for (byte value : data) hex.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return hex.toString();
    }
}
