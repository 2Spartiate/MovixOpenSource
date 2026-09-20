// Générateur des pastilles rondes de la présence PreMiD (PreMid/assets/*.png,
// publiées sur cdn.rcd.gg/PreMiD/websites/M/Movix/assets/ au merge dans le
// store PreMiD). Usage : node others/premid-icons-generator.mjs
// Glyphe blanc sur cercle rouge Movix (#dc2626), 512x512, antialiasé par
// suréchantillonnage 4x. Aucune dépendance : l'encodeur PNG utilise zlib.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 512
const SS = 4
const RED = [220, 38, 38]
const WHITE = [255, 255, 255]

const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0 // filtre None
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function inTriangle(u, v, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (u - bx) * (ay - by) - (ax - bx) * (v - by)
  const d2 = (u - cx) * (by - cy) - (bx - cx) * (v - cy)
  const d3 = (u - ax) * (cy - ay) - (cx - ax) * (v - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function capsuleDistance(u, v, [ax, ay], [bx, by]) {
  const abx = bx - ax
  const aby = by - ay
  const t = Math.max(
    0,
    Math.min(1, ((u - ax) * abx + (v - ay) * aby) / (abx * abx + aby * aby)),
  )
  return Math.hypot(u - (ax + abx * t), v - (ay + aby * t))
}

// Chaque glyphe reçoit (u, v) dans l'espace du cercle (rayon 1, v vers le bas)
// et répond vrai là où le tracé est blanc.
const GLYPHS = {
  play(u, v) {
    return inTriangle(u, v, [-0.30, -0.42], [-0.30, 0.42], [0.48, 0])
  },
  pause(u, v) {
    if (Math.abs(v) > 0.40) {
      return false
    }
    return (u >= -0.36 && u <= -0.12) || (u >= 0.12 && u <= 0.36)
  },
  stop(u, v) {
    return Math.abs(u) <= 0.34 && Math.abs(v) <= 0.34
  },
  search(u, v) {
    const ring = Math.abs(Math.hypot(u + 0.10, v + 0.10) - 0.33) <= 0.09
    const handle = capsuleDistance(u, v, [0.16, 0.16], [0.50, 0.50]) <= 0.09
    return ring || handle
  },
  live(u, v) {
    const radius = Math.hypot(u, v)
    if (radius <= 0.13) {
      return true
    }
    const angleRight = Math.abs(Math.atan2(v, u))
    const angleLeft = Math.abs(Math.atan2(v, -u))
    const inArcAngle = angleRight <= 0.85 || angleLeft <= 0.85
    if (!inArcAngle) {
      return false
    }
    return Math.abs(radius - 0.40) <= 0.075 || Math.abs(radius - 0.64) <= 0.075
  },
}

function renderIcon(glyph) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  const grid = SIZE * SS
  const center = grid / 2
  const badgeRadius = grid * 0.47

  for (let py = 0; py < SIZE; py += 1) {
    for (let px = 0; px < SIZE; px += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const gx = px * SS + sx + 0.5
          const gy = py * SS + sy + 0.5
          const u = (gx - center) / badgeRadius
          const v = (gy - center) / badgeRadius

          if (Math.hypot(u, v) > 1) {
            continue
          }

          const color = glyph(u, v) ? WHITE : RED
          r += color[0]
          g += color[1]
          b += color[2]
          a += 255
        }
      }

      const samples = SS * SS
      const offset = (py * SIZE + px) * 4
      const alpha = a / samples
      rgba[offset] = alpha > 0 ? Math.round((r / samples) * 255 / alpha) : 0
      rgba[offset + 1] = alpha > 0 ? Math.round((g / samples) * 255 / alpha) : 0
      rgba[offset + 2] = alpha > 0 ? Math.round((b / samples) * 255 / alpha) : 0
      rgba[offset + 3] = Math.round(alpha)
    }
  }

  return encodePng(SIZE, SIZE, rgba)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputDir = join(scriptDir, '..', 'PreMid', 'assets')
mkdirSync(outputDir, { recursive: true })

for (const [name, glyph] of Object.entries(GLYPHS)) {
  const file = join(outputDir, `${name}.png`)
  writeFileSync(file, renderIcon(glyph))
  console.log(`écrit ${file}`)
}
