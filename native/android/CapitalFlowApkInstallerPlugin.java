package com.socrateslever.capitalflow;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
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
 * Installation still requires an explicit Android Package Installer confirmation.
 */
@CapacitorPlugin(name = "CapitalFlowApkInstaller")
public final class CapitalFlowApkInstallerPlugin extends Plugin {
    private static final String RELEASE =
        "https://github.com/socrateslever1/CapitalFlow/releases/download/android-signed-beta/CapitalFlow-Android.apk";
    private static final long MAX_BYTES = 150L * 1024L * 1024L;
    private final AtomicBoolean downloading = new AtomicBoolean(false);

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
                File validated = verified;
                getActivity().runOnUiThread(() -> {
                    try {
                        Uri apkUri = FileProvider.getUriForFile(getContext(),
                            getContext().getPackageName() + ".capitalflowapk", validated);
                        Intent install = new Intent(Intent.ACTION_VIEW);
                        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        getActivity().startActivity(install);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Não foi possível abrir o instalador do Android.", null, e);
                    }
                });
            } catch (Exception e) {
                call.reject("Falha ao baixar atualização: " + e.getMessage(), null, e);
            } finally {
                if (temp != null) temp.delete();
                downloading.set(false);
            }
        }, "CapitalFlow-SignedApk");
        worker.setDaemon(true);
        worker.start();
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
