package com.movix.app.cast

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CastStatusMapperTest {
    @Test
    fun preservesBoundedNativeFailureCodesWithoutReplacingTheUiError() {
        val status = CastStatusMapper.withoutOwnedLoad(
            true, "Salon", false, false, "MOVIX_CAST_LOAD_REJECTED", "GCK_STATUS_2100",
        )
        assertEquals("MOVIX_CAST_LOAD_REJECTED", status.errorCode)
        assertEquals("GCK_STATUS_2100", status.nativeErrorCode)
        assertNull(CastStatusMapper.withoutOwnedLoad(
            true, "Salon", true, false, "MOVIX_CAST_LOAD_REJECTED", "GCK_STATUS_2100",
        ).nativeErrorCode)
        assertNull(CastStatusMapper.withoutOwnedLoad(
            true, "Salon", false, false, "MOVIX_CAST_LOAD_REJECTED", "https://secret.example/token",
        ).nativeErrorCode)
    }

    @Test
    fun connectedReceiverWithoutMediaIsIdleNotInterrupted() {
        val status = CastStatusMapper.withoutOwnedLoad(true, "Salon", false, false)
        assertEquals("idle", status.state)
        assertNull(status.errorCode)
    }

    @Test
    fun preparingNewLoadNeverReportsAnOldRelayAsLost() {
        val status = CastStatusMapper.withoutOwnedLoad(true, "Salon", true, true, "MOVIX_CAST_LOAD_REJECTED")
        assertEquals("loading", status.state)
        assertNull(status.errorCode)
    }

    @Test
    fun onlyOrphanedMovixMediaRequiresReload() {
        val status = CastStatusMapper.withoutOwnedLoad(true, "Salon", false, true)
        assertEquals("error", status.state)
        assertEquals("MOVIX_RELAY_RELOAD_REQUIRED", status.errorCode)
        assertNull(CastStatusMapper.withoutOwnedLoad(false, null, false, true).errorCode)
    }

    @Test
    fun preservesActualLoadFailureAcrossStatusRefreshes() {
        val status = CastStatusMapper.withoutOwnedLoad(true, "Salon", false, true, "MOVIX_RELAY_UPSTREAM_ERROR")
        assertEquals("MOVIX_RELAY_UPSTREAM_ERROR", status.errorCode)
    }

    @Test
    fun mapsStablePlaybackStatesAndTiming() {
        val status = CastStatusMapper.map(
            CastStatusSnapshot(
                connected = true,
                deviceName = "Salon",
                mediaSessionId = 42,
                playbackState = NativeCastPlaybackState.PLAYING,
                positionMs = 12_500L,
                durationMs = 90_000L,
                canSeek = true,
            ),
        )

        assertEquals("playing", status.state)
        assertEquals(12.5, status.positionSec, 0.0)
        assertEquals(90.0, status.durationSec ?: 0.0, 0.0)
        assertEquals(42, status.mediaSessionId)
        assertEquals("Salon", status.deviceName)
        assertTrue(status.canSeek)
        assertNull(status.errorCode)
    }

    @Test
    fun preservesOnlyStableIdleAndErrorCodes() {
        val ended = CastStatusMapper.map(
            CastStatusSnapshot(
                connected = true,
                playbackState = NativeCastPlaybackState.ENDED,
                idleReason = "FINISHED",
            ),
        )
        val error = CastStatusMapper.map(
            CastStatusSnapshot(
                connected = true,
                playbackState = NativeCastPlaybackState.ERROR,
                idleReason = "ERROR",
                errorCode = "MOVIX_RELAY_UPSTREAM_ERROR",
            ),
        )

        assertEquals("ended", ended.state)
        assertEquals("FINISHED", ended.idleReason)
        assertEquals("error", error.state)
        assertEquals("MOVIX_RELAY_UPSTREAM_ERROR", error.errorCode)
        assertFalse(error.canSeek)
    }
}
