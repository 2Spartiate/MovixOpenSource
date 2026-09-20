package com.movix.app.cast

import android.app.PendingIntent
import android.app.Application
import com.movix.app.proxy.CastMediaProfile
import com.movix.app.proxy.CastMediaPreparer
import com.movix.app.proxy.CastPreparedSource
import com.movix.app.proxy.MediaProxyTarget
import com.movix.app.proxy.MediaProxyUpstream
import com.movix.app.proxy.MediaProxyUpstreamResponse
import com.movix.app.proxy.MediaProxySessionAccess
import com.movix.app.proxy.MediaProxySessionStore
import java.net.InetAddress
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Robolectric
import org.robolectric.Shadows
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class CastProxyForegroundServiceTest {
    @Test
    @Config(application = Application::class, sdk = [28])
    fun latePreparationFailureReportsOnlyThatRequestWithoutStoppingTheRelay() {
        val controller = Robolectric.buildService(CastProxyForegroundService::class.java).create()
        val service = controller.get()
        val store = MediaProxySessionStore()
        installStore(service, store)
        val preparer = CastMediaPreparer(
            upstream = object : MediaProxyUpstream {
                override fun execute(
                    target: MediaProxyTarget,
                    localRequestHeaders: Map<String, String>,
                ): MediaProxyUpstreamResponse = throw IllegalStateException("MOVIX_RELAY_UPSTREAM_ERROR")
            },
            sessionStore = store,
            access = MediaProxySessionAccess.castLan(
                InetAddress.getByName("192.168.1.2"), InetAddress.getByName("192.168.1.8"),
            ),
            port = 28123,
            executor = Executor { it.run() },
        )
        try {
            val replacement = createSession(store)
            var reported = false
            val request = CastRelayPendingRequest(
                CastRelayRequest("Salon", InetAddress.getByName("192.168.1.8"),
                    CastPreparedSource("https://cdn.example/movie.mp4", emptyMap())),
            ) { reported = it.isFailure }
            CastProxyForegroundService::class.java.getDeclaredMethod(
                "prepareWith", CastRelayPendingRequest::class.java, CastMediaPreparer::class.java,
            ).apply {
                isAccessible = true
                invoke(service, request, preparer)
            }
            assertTrue(reported)
            assertFalse(Shadows.shadowOf(service).isStoppedBySelf)
            assertTrue(store.resolveCast(replacement.sessionId, replacement.resourceId) != null)
        } finally {
            preparer.close()
            controller.destroy()
        }
    }

    @Test
    @Config(application = Application::class, sdk = [28])
    fun discardingSupersededPreparationKeepsTheNewRelayAlive() {
        val controller = Robolectric.buildService(CastProxyForegroundService::class.java).create()
        val service = controller.get()
        val store = MediaProxySessionStore()
        installStore(service, store)
        try {
            val first = createSession(store)
            val replacement = createSession(store)
            service.discardPreparedSession(first.sessionId)

            assertFalse(Shadows.shadowOf(service).isStoppedBySelf)
            assertTrue(store.resolveCast(replacement.sessionId, replacement.resourceId) != null)
            assertTrue(store.resolveCast(first.sessionId, first.resourceId) == null)
        } finally {
            controller.destroy()
        }
    }

    @Test
    @Config(application = Application::class, sdk = [28])
    fun acceptedSessionSurvivesPauseAndExpiresOnlyAfterReplacementGrace() {
        var now = 1_000L
        val controller = Robolectric.buildService(CastProxyForegroundService::class.java).create()
        val service = controller.get()
        val store = MediaProxySessionStore(now = { now }, idleTtlMs = 1_000L)
        installStore(service, store)
        try {
            val first = createSession(store)
            service.replaceAcceptedSession(first.sessionId)
            now += 2_000L
            assertTrue(store.resolveCast(first.sessionId, first.resourceId) != null)
            val replacement = createSession(store)
            service.replaceAcceptedSession(replacement.sessionId)
            now += 5_000L
            assertTrue(store.resolveCast(first.sessionId, first.resourceId) != null)
            now += 6_000L
            assertTrue(store.resolveCast(first.sessionId, first.resourceId) == null)
            assertTrue(store.resolveCast(replacement.sessionId, replacement.resourceId) != null)
            service.stopRelay(CastRelayStopReason.EXPLICIT)
            assertTrue(store.resolveCast(replacement.sessionId, replacement.resourceId) == null)
        } finally {
            controller.destroy()
        }
    }

    private fun installStore(service: CastProxyForegroundService, store: MediaProxySessionStore) {
        CastProxyForegroundService::class.java.getDeclaredField("sessionStore").apply {
            isAccessible = true
            set(service, store)
        }
    }

    private fun createSession(store: MediaProxySessionStore) = store.createCast(
        "https://cdn.example/movie.mp4", "GET", emptyMap(), 28123,
        MediaProxySessionAccess.castLan(
            InetAddress.getByName("192.168.1.2"), InetAddress.getByName("192.168.1.8"),
        ),
        CastMediaProfile.progressive("video/mp4")!!,
    )

    @Test
    fun startIntentCarriesOnlyTheOpaqueRequestId() {
        val context = RuntimeEnvironment.getApplication()
        val intent = CastProxyForegroundService.startIntent(context, "opaque_request_0001")

        assertEquals(CastProxyForegroundService.ACTION_START, intent.action)
        assertEquals(
            setOf(CastProxyForegroundService.EXTRA_REQUEST_ID),
            intent.extras?.keySet(),
        )
        assertEquals(
            CastProxyForegroundService::class.java.name,
            intent.component?.className,
        )
    }

    @Test
    fun stopPendingIntentIsExplicitAndImmutable() {
        val context = RuntimeEnvironment.getApplication()
        val pending = CastProxyForegroundService.stopPendingIntent(context)
        val flags = pendingIntentFlags(pending)

        assertTrue(flags and PendingIntent.FLAG_IMMUTABLE != 0)
        assertFalse(flags and PendingIntent.FLAG_MUTABLE != 0)
    }

    private fun pendingIntentFlags(pendingIntent: PendingIntent): Int {
        val shadow = org.robolectric.Shadows.shadowOf(pendingIntent)
        return shadow.flags
    }
}
