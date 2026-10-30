package com.socrateslever.capitalflow;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Locale;

/** Accept one user-shared statement without storing it or uploading it. */
@CapacitorPlugin(name = "WalletFileInbox")
public final class WalletFileInboxPlugin extends Plugin {
    private static final int MAX_BYTES = 10 * 1024 * 1024;

    private Uri incomingUri() {
        Intent intent = getActivity().getIntent();
        if (intent == null) return null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) return intent.getData();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            return intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        return null;
    }

    private String displayName(Uri uri) {
        String name = null;
        try (Cursor cursor = getContext().getContentResolver().query(
                uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                name = cursor.getString(0);
            }
        } catch (Exception ignored) {
            // File providers differ. Fall back to a sanitized URI segment.
        }
        if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment();
        if (name == null) name = "documento";
        name = name.replaceAll("[\\r\\n\\\\/]", "_");
        return name.length() > 160 ? name.substring(name.length() - 160) : name;
    }

    private String allowedName(String name, String mime) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.matches(".*\\.(ofx|qfx|pdf|png|jpg|jpeg|webp)$")) return name;
        if ("application/pdf".equals(mime)) return name + ".pdf";
        if ("application/x-ofx".equals(mime) || "application/ofx".equals(mime)
            || "application/vnd.intu.qfx".equals(mime)) return name + ".ofx";
        // Generic binary without an actual recognized extension is unsafe.
        return null;
    }

    @PluginMethod
    public void peek(PluginCall call) {
        JSObject result = new JSObject();
        result.put("pending", incomingUri() != null);
        call.resolve(result);
    }

    @PluginMethod
    public void consume(PluginCall call) {
        Uri uri = incomingUri();
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())
                && !"file".equalsIgnoreCase(uri.getScheme())) {
            call.reject("Nenhum documento compartilhado está disponível.");
            return;
        }
        new Thread(() -> {
            try {
                String mime = getContext().getContentResolver().getType(uri);
                String name = allowedName(displayName(uri), mime);
                if (name == null) throw new IllegalArgumentException(
                    "Formato não reconhecido. Envie uma fatura OFX, QFX, PDF ou imagem.");
                ByteArrayOutputStream content = new ByteArrayOutputStream();
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new IllegalStateException("Arquivo não pode ser lido.");
                    byte[] buffer = new byte[16 * 1024];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        if (content.size() + count > MAX_BYTES) throw new IllegalArgumentException(
                            "Documento maior que 10 MB. Importe o arquivo pelo computador.");
                        content.write(buffer, 0, count);
                    }
                }
                JSObject result = new JSObject();
                result.put("name", name);
                result.put("mimeType", mime == null ? "application/octet-stream" : mime);
                result.put("base64", Base64.encodeToString(content.toByteArray(), Base64.NO_WRAP));
                // Clear only after bytes are safely read, not before.
                getActivity().runOnUiThread(() -> getActivity().setIntent(new Intent()));
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Não foi possível ler o documento." : error.getMessage());
            }
        }, "capitalflow-import-file").start();
    }
}
