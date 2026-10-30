package com.socrateslever.capitalflow;

import android.os.Bundle;
import android.content.Intent;
import android.view.View;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Android/desktop-Android system Back must be handled by the React router.
 * The callback is registered after Capacitor's bridge setup so it receives
 * Back before the default activity-finish behavior on modern Android.
 * The JS app decides between nested route, tab history and exit confirmation.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WalletFileInboxPlugin.class);
        super.onCreate(savedInstanceState);

        configureSystemBarInsets();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null) {
                    getBridge().triggerWindowJSEvent("capitalflow:android-back");
                }
            }
        });
    }
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent("capitalflow:file-arrived");
        }
    }

    /**
     * The activity is edge-to-edge on Android 15+ (and in desktop windowing).
     * Apply real system bar/cutout insets to the NATIVE container, not a fixed
     * CSS spacer. This adapts to status-bar height, 3-button/gesture navigation,
     * landscape camera cutouts, foldables and resizable Android desktop windows.
     *
     * After applying padding natively, zero these inset types for the WebView
     * to prevent the ghost/double padding documented by Android. IME/keyboard
     * insets are left intact, so keyboard viewport resizing still works.
     */
    private void configureSystemBarInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        final View content = findViewById(android.R.id.content);
        if (content == null) return;

        final int initialLeft = content.getPaddingLeft();
        final int initialTop = content.getPaddingTop();
        final int initialRight = content.getPaddingRight();
        final int initialBottom = content.getPaddingBottom();

        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            final int insetTypes = WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout();
            final Insets bars = windowInsets.getInsets(insetTypes);

            view.setPadding(
                    initialLeft + bars.left,
                    initialTop + bars.top,
                    initialRight + bars.right,
                    initialBottom + bars.bottom
            );

            return new WindowInsetsCompat.Builder(windowInsets)
                    .setInsets(insetTypes, Insets.NONE)
                    .build();
        });
        ViewCompat.requestApplyInsets(content);
    }

}
