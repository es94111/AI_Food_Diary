package aifood.shao.one

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * AES-256 encrypted storage for the one secret the widgets need: the session
 * cookie used to call the API from [WaterQuickAddReceiver]. Kept out of the
 * plaintext [HomeWidgetContract.PREFS] so it is not readable from a device
 * backup or by a root/adb dump.
 */
object SecureWidgetStore {
    private fun prefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            HomeWidgetContract.SECURE_PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun putSessionCookie(context: Context, cookie: String) {
        runCatching {
            prefs(context).edit()
                .putString(HomeWidgetContract.KEY_SESSION_COOKIE, cookie)
                .apply()
        }
    }

    fun sessionCookie(context: Context): String? =
        runCatching {
            prefs(context).getString(HomeWidgetContract.KEY_SESSION_COOKIE, null)
        }.getOrNull()

    fun clear(context: Context) {
        runCatching { prefs(context).edit().clear().apply() }
    }
}
