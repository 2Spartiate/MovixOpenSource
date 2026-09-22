package com.movix.app.dns

import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * VPN local qui redirige UNIQUEMENT les requêtes DNS vers Cloudflare 1.1.1.1.
 * Le reste du trafic réseau n'est PAS affecté.
 */
class DnsVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    @Volatile
    private var isRunning = false
    private var dnsThread: Thread? = null
    private var dnsExecutor: ExecutorService? = null

    companion object {
        private const val VPN_ADDRESS = "10.215.173.1"
        private const val VIRTUAL_DNS = "10.215.173.2"
        private const val DNS_PORT = 53
        private const val DNS_WORKER_COUNT = 8

        var primaryDns: String = "1.1.1.1"
        var secondaryDns: String = "1.0.0.1"
        @Volatile
        var isActive: Boolean = false
            private set

        @Volatile
        var isReady: Boolean = false
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
                .addAddress(VPN_ADDRESS, 32)
                // Android envoie ses requêtes DNS vers une adresse virtuelle
                // interne au TUN. Les vraies IP Cloudflare ne sont PAS routées
                // dans le VPN : les sockets upstream protégés sortent donc
                // directement par le réseau sous-jacent.
                .addDnsServer(VIRTUAL_DNS)
                .addRoute(VIRTUAL_DNS, 32)
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
                isReady = false
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
            val executor = Executors.newFixedThreadPool(DNS_WORKER_COUNT)
            dnsExecutor = executor

            // The forwarder itself is now armed: the TUN fd is acquired,
            // streams are open and the DNS worker pool is available.
            isReady = true

            try {
                while (isRunning) {
                try {
                    val length = input.read(buffer)
                    if (length <= 0) continue

                    val packet = buffer.copyOf(length)

                    // Tout ce qui arrive ici est du DNS (grâce aux routes spécifiques)
                    val ipHeaderLength = (packet[0].toInt() and 0x0F) * 4
                    if (packet.size < ipHeaderLength + 8) continue

                    val protocol = packet[9].toInt() and 0xFF
                    if (protocol != 17) continue // J1: UDP uniquement

                    val destinationPort =
                        ((packet[ipHeaderLength + 2].toInt() and 0xFF) shl 8) or
                            (packet[ipHeaderLength + 3].toInt() and 0xFF)
                    if (destinationPort != DNS_PORT) continue

                    val dnsPayload = packet.copyOfRange(ipHeaderLength + 8, packet.size)
                    executor.execute {
                        if (!isRunning) return@execute

                        val response = forwardDnsQuery(dnsPayload) ?: return@execute
                        val responsePacket =
                            buildResponsePacket(packet, ipHeaderLength, response) ?: return@execute

                        try {
                            synchronized(output) {
                                if (isRunning) {
                                    output.write(responsePacket)
                                }
                            }
                        } catch (_: Exception) {
                            // Le tunnel peut être fermé pendant qu'une requête
                            // parallèle se termine. La session suivante recrée
                            // une interface et un pool de workers neufs.
                        }
                    }
                    } catch (_: Exception) {
                        if (!isRunning) break
                    }
                }
            } finally {
                isReady = false
                executor.shutdownNow()
                if (dnsExecutor === executor) {
                    dnsExecutor = null
                }
                try { input.close() } catch (_: Exception) {}
                try { output.close() } catch (_: Exception) {}
            }
        }.also { it.start() }
    }

    private fun forwardDnsQuery(query: ByteArray): ByteArray? {
        return try {
            val socket = DatagramSocket()
            socket.soTimeout = 5000
            protect(socket)

            val address = InetAddress.getByName(primaryDns)
            socket.send(DatagramPacket(query, query.size, address, DNS_PORT))

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
                socket.send(DatagramPacket(query, query.size, address, DNS_PORT))

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
        isReady = false
        isActive = false
        dnsThread?.interrupt()
        dnsThread = null
        dnsExecutor?.shutdownNow()
        dnsExecutor = null
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
