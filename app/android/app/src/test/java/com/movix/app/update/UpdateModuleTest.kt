package com.movix.app.update

import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Promise
import com.movix.app.BuildConfig
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class UpdateModuleTest {
    private class Result {
        var resolved: Any? = null
        var rejection: String? = null
        val promise = Proxy.newProxyInstance(
            Promise::class.java.classLoader, arrayOf(Promise::class.java),
        ) { _, method, args ->
            if (method.name == "resolve") resolved = args?.get(0)
            if (method.name == "reject") rejection = args?.get(0) as? String
            null
        } as Promise
    }

    @Test
    fun `Android build defaults to disabled updates and refuses native side effects`() {
        assertFalse(BuildConfig.APK_UPDATES_ENABLED)
        val application = RuntimeEnvironment.getApplication()
        val module = UpdateModule(BridgeReactContext(application))
        val permission = Result()
        module.canInstallApks(permission.promise)
        assertEquals(false, permission.resolved)

        val attempts = listOf<(Promise) -> Unit>(
            { module.openInstallSettings(it) },
            { module.enqueueDownload("https://example.com/official.apk", "official.apk", "Update", it) },
            { module.installApk("/old/official.apk", it) },
        )
        for (attempt in attempts) {
            val result = Result()
            attempt(result.promise)
            assertEquals("APK_UPDATES_DISABLED", result.rejection)
            assertNull(result.resolved)
        }
        assertNull(shadowOf(application).nextStartedActivity)
        assertNull(application.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS)
            ?.listFiles()?.firstOrNull { it.name == "official.apk" })
    }

    @Test
    fun `version information is still accessible while the installer is disabled`() {
        val module = UpdateModule(BridgeReactContext(RuntimeEnvironment.getApplication()))
        val code = Result()
        val name = Result()
        module.getVersionCode(code.promise)
        module.getVersionName(name.promise)
        assertEquals(BuildConfig.VERSION_CODE_INT, code.resolved)
        assertEquals(BuildConfig.VERSION_NAME_STR, name.resolved)
    }
}
