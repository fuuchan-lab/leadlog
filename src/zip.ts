/**
 * 展示会ごとの書き出し（Excel・名刺画像・JSONデータ）を、この端末には1つのファイルとしてダウンロードするための
 * 簡易な ZIP の作成・展開。ブラウザのダウンロードはフォルダーを作れないので、複数のファイルをまとめる。
 * 圧縮・展開はブラウザ標準の CompressionStream/DecompressionStream（deflate-raw）を使う
 * （対応していない環境では、圧縮せずそのまま保存する。どちらでも読み込みには対応する）。
 */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([data.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { date, time }
}

/** 複数のファイルを1つの ZIP にまとめる */
export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder()
  const { date, time } = dosDateTime()
  const parts: BlobPart[] = []
  const central: BlobPart[] = []
  let offset = 0
  let centralSize = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const compressed = await deflate(entry.data)
    const method = compressed ? 8 : 0
    const body = compressed ?? entry.data

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0, true)
    local.setUint16(8, method, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, body.length, true)
    local.setUint32(22, entry.data.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    parts.push(local.buffer, nameBytes.slice(), body.slice())

    const centralHeader = new DataView(new ArrayBuffer(46))
    centralHeader.setUint32(0, 0x02014b50, true)
    centralHeader.setUint16(4, 20, true)
    centralHeader.setUint16(6, 20, true)
    centralHeader.setUint16(8, 0, true)
    centralHeader.setUint16(10, method, true)
    centralHeader.setUint16(12, time, true)
    centralHeader.setUint16(14, date, true)
    centralHeader.setUint32(16, crc, true)
    centralHeader.setUint32(20, body.length, true)
    centralHeader.setUint32(24, entry.data.length, true)
    centralHeader.setUint16(28, nameBytes.length, true)
    centralHeader.setUint32(42, offset, true)
    central.push(centralHeader.buffer, nameBytes)

    offset += 30 + nameBytes.length + body.length
    centralSize += 46 + nameBytes.length
  }

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}

/** ZIP からファイルを取り出す（末尾の中央ディレクトリを読む。ZIP コメントは付いていない前提） */
export async function readZip(blob: Blob): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const eocdOffset = buf.length - 22
  if (eocdOffset < 0 || view.getUint32(eocdOffset, true) !== 0x06054b50) throw new Error('invalid-zip')
  const count = view.getUint16(eocdOffset + 10, true)
  let pos = view.getUint32(eocdOffset + 16, true)
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('invalid-zip-central')
    const method = view.getUint16(pos + 10, true)
    const compSize = view.getUint32(pos + 20, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const localOffset = view.getUint32(pos + 42, true)
    const name = decoder.decode(buf.subarray(pos + 46, pos + 46 + nameLen))
    pos += 46 + nameLen + extraLen + commentLen

    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    entries.push({ name, data: method === 0 ? raw.slice() : await inflate(raw) })
  }
  return entries
}
