package com.socrateslever.capitalflow;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
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
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null) {
                    getBridge().triggerWindowJSEvent("capitalflow:android-back");
                }
            }
        });
    }
}
