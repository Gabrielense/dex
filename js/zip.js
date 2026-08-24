/* ZIP mínimo (leitura + escrita) usando as APIs nativas do navegador.
   Minimal ZIP (read + write) on the browser's built-in compression streams.
   Um .xlsx é só um zip de XMLs — isto evita depender de qualquer biblioteca. */

const Zip = (() => {
  const SIG_LOCAL = 0x04034b50, SIG_CD = 0x02014b50, SIG_EOCD = 0x06054b50;

  /* --- CRC32 --- */
  let TABLE = null;
  function crcTable() {
    if (TABLE) return TABLE;
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[n] = c >>> 0;
    }
    return TABLE;
  }
  function crc32(buf) {
    const tb = crcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = tb[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function supported() {
    return typeof DecompressionStream === "function";
  }

  async function inflateRaw(bytes) {
    if (!supported()) {
      throw new Error("Este navegador não suporta DecompressionStream. " +
                      "Use um navegador mais recente ou importe o backup .json.");
    }
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function deflateRaw(bytes) {
    if (typeof CompressionStream !== "function") return null;
    const cs = new CompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* --- leitura --- */
  async function read(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);

    // acha o End Of Central Directory varrendo do fim
    let eocd = -1;
    const min = Math.max(0, buf.length - 66000);
    for (let i = buf.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Arquivo não parece um .xlsx válido (zip sem EOCD).");

    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    if (off === 0xFFFFFFFF) throw new Error("ZIP64 não suportado.");

    const out = new Map();
    const dec = new TextDecoder("utf-8");
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(off, true) !== SIG_CD) break;
      const method = dv.getUint16(off + 10, true);
      const csize  = dv.getUint32(off + 20, true);
      const fnlen  = dv.getUint16(off + 28, true);
      const exlen  = dv.getUint16(off + 30, true);
      const cmlen  = dv.getUint16(off + 32, true);
      const lho    = dv.getUint32(off + 42, true);
      const name   = dec.decode(buf.subarray(off + 46, off + 46 + fnlen));

      if (dv.getUint32(lho, true) === SIG_LOCAL) {
        const lfn = dv.getUint16(lho + 26, true);
        const lex = dv.getUint16(lho + 28, true);
        const start = lho + 30 + lfn + lex;
        const raw = buf.subarray(start, start + csize);
        out.set(name, method === 0 ? raw : await inflateRaw(raw));
      }
      off += 46 + fnlen + exlen + cmlen;
    }
    return out;
  }

  /* --- escrita --- */
  /* files: [{name, data: Uint8Array}] -> Blob */
  async function write(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;

    // data/hora fixas: mantém o arquivo reproduzível
    const dosTime = 0, dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const raw = f.data;
      const crc = crc32(raw);
      let method = 0, payload = raw;
      const comp = await deflateRaw(raw);
      if (comp && comp.length < raw.length) { method = 8; payload = comp; }

      const local = new Uint8Array(30 + nameBytes.length);
      const ldv = new DataView(local.buffer);
      ldv.setUint32(0, SIG_LOCAL, true);
      ldv.setUint16(4, 20, true);
      ldv.setUint16(6, 0x0800, true);          // nomes em UTF-8
      ldv.setUint16(8, method, true);
      ldv.setUint16(10, dosTime, true);
      ldv.setUint16(12, dosDate, true);
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, payload.length, true);
      ldv.setUint32(22, raw.length, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      parts.push(local, payload);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cd.buffer);
      cdv.setUint32(0, SIG_CD, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, method, true);
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, payload.length, true);
      cdv.setUint32(24, raw.length, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + payload.length;
    }

    let cdSize = 0;
    for (const c of central) cdSize += c.length;

    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, SIG_EOCD, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);

    return new Blob([...parts, ...central, eocd], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  return { read, write, crc32, supported };
})();
