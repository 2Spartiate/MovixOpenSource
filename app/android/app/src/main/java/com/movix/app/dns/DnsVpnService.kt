package com.movix.app.dns

import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * VPN local qui redirige UNIQUEMENT les requêtes DNS vers Cloudflare 1.1.1.1.
 * Le reste du trafic réseau n'est PAS affecté.
 */
class DnsVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    private var isRunning = false
    private var dnsThread: Thread? = null

    companion object {
        var primaryDns: String = "1.1.1.1"
        var secondaryDns: String = "1.0.0.1"
        var isActive: Boolean = false
            private set
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopVpn()
            return START_NOT_STICKY
        }

        intent?.getStringExtra(EXTRA_PRIMARY_DNS)?.let { primaryDns = it }
        intent?.getStringExtra(EXTRA_SECONDARY_DNS)?.let { secondaryDns = it }

        startVpn()
        return START_NOT_STICKY
    }

    private fun startVpn() {
        if (isRunning) return

        try {
            val builder = Builder()
                .setSession("Movix DNS")
                .addAddress("10.215.173.1", 32)
                .addDnsServer(primaryDns)
                .addDnsServer(secondaryDns)
                // Route UNIQUEMENT les adresses DNS, pas tout le trafic
                .addRoute(primaryDns, 32)
                .addRoute(secondaryDns, 32)
                .setMtu(1500)
                .setBlocking(true)

            // NE PAS exclure l'app du VPN : sinon le WebView bypass le DNS custom
            // et résout via le DNS système (ce qui fait échouer les requêtes vers
            // les domaines bloqués par le FAI). Les boucles DNS sont déjà évitées
            // via protect(socket) dans forwardDnsQuery().

            vpnInterface = builder.establish()

            if (vpnInterface != null) {
                isRunning = true
                isActive = true
                startDnsForwarding()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            stopVpn()
        }
    }

    private fun startDnsForwarding() {
        dnsThread = Thread {
            val fd = vpnInterface?.fileDescriptor ?: return@Thread
            val input = FileInputStream(fd)
            val output = FileOutputStream(fd)
            val buffer = ByteArray(32767)

            while (isRunning) {
                try {
                    val length = input.read(buffer)
                    if (length <= 0) continue

                    val packet = buffer.copyOf(length)

                    // Tout ce qui arrive ici est du DNS (grâce aux routes spécifiques)
                    val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4
                    if (packet.size < ipHeaderLength + 8) continue

                    val protocol = packet[9].toInt() and 0xFF
                    if (protocol != 17) continue // UDP seulement

                    val dnsPayload = packet.copyOfRange(ipHeaderLength + 8, packet.size)
                    val response = forwardDnsQuery(dnsPayload) ?: continue
                    val responsePacket = buildResponsePacket(packet, ipHeaderLength, response) ?: continue
                    output.write(responsePacket)
                } catch (_: Exception) {
                    if (!isRunning) break
                }
            }

            try { input.close() } catch (_: Exception) {}
            try { output.close() } catch (_: Exception) {}
        }.also { it.start() }
    }

    private fun forwardDnsQuery(query: ByteArray): ByteArray? {
        return try {
            val socket = DatagramSocket()
            socket.soTimeout = 5000
            protect(socket)

            val address = InetAddress.getByName(primaryDns)
            socket.send(DatagramPacket(query, query.size, address, 53))

            val responseBuffer = ByteArray(4096)
            val responsePacket = DatagramPacket(responseBuffer, responseBuffer.size)
            socket.receive(responsePacket)
            socket.close()

            responseBuffer.copyOf(responsePacket.length)
        } catch (_: Exception) {
            try {
                val socket = DatagramSocket()
                socket.soTimeout = 5000
                protect(socket)

                val address = InetAddress.getByName(secondaryDns)
                socket.send(DatagramPacket(query, query.size, address, 53))

                val responseBuffer = ByteArray(4096)
                val responsePacket = DatagramPacket(responseBuffer, responseBuffer.size)
                socket.receive(responsePacket)
                socket.close()

                responseBuffer.copyOf(responsePacket.length)
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun buildResponsePacket(originalPacket: ByteArray, ipHeaderLength: Int, dnsResponse: ByteArray): ByteArray? {
        try {
            val totalLength = ipHeaderLength + 8 + dnsResponse.size
            val response = ByteArray(totalLength)

            // Copie le header IP
            System.arraycopy(originalPacket, 0, response, 0, ipHeaderLength)
            // Swap src/dst IP
            System.arraycopy(originalPacket, 12, response, 16, 4)
            System.arraycopy(originalPacket, 16, response, 12, 4)
            // Total length
            response[2] = ((totalLength shr 8) and 0xFF).toByte()
            response[3] = (totalLength and 0xFF).toByte()

            // UDP Header — swap ports
            response[ipHeaderLength] = originalPacket[ipHeaderLength + 2]
            response[ipHeaderLength + 1] = originalPacket[ipHeaderLength + 3]
            response[ipHeaderLength + 2] = originalPacket[ipHeaderLength]
            response[ipHeaderLength + 3] = originalPacket[ipHeaderLength + 1]
            val udpLength = 8 + dnsResponse.size
            response[ipHeaderLength + 4] = ((udpLength shr 8) and 0xFF).toByte()
            response[ipHeaderLength + 5] = (udpLength and 0xFF).toByte()
            response[ipHeaderLength + 6] = 0
            response[ipHeaderLength + 7] = 0

            // DNS payload
            System.arraycopy(dnsResponse, 0, response, ipHeaderLength + 8, dnsResponse.size)

            // Recalcul checksum IP
            response[10] = 0
            response[11] = 0
            var checksum = 0
            for (i in 0 until ipHeaderLength step 2) {
                checksum += ((response[i].toInt() and 0xFF) shl 8) or (response[i + 1].toInt() and 0xFF)
            }
            checksum = (checksum shr 16) + (checksum and 0xFFFF)
            checksum += checksum shr 16
            checksum = checksum.inv() and 0xFFFF
            response[10] = ((checksum shr 8) and 0xFF).toByte()
            response[11] = (checksum and 0xFF).toByte()

            return response
        } catch (_: Exception) {
            return null
        }
    }

    private fun stopVpn() {
        isRunning = false
        isActive = false
        dnsThread?.interrupt()
        dnsThread = null
        try { vpnInterface?.close() } catch (_: Exception) {}
        vpnInterface = null
        stopSelf()
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    override fun onRevoke() {
        stopVpn()
        super.onRevoke()
    }
}

const val ACTION_STOP = "com.movix.app.dns.STOP"
const val EXTRA_PRIMARY_DNS = "primary_dns"
const val EXTRA_SECONDARY_DNS = "secondary_dns"
