const fs = require('node:fs/promises');
const path = require('node:path');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Store entries with UTF-8 names and Unix permissions; no host-specific ZIP tool is required.
async function bundleZip(bundle) {
  const local = [], central = [];
  let offset = 0;
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(filename); continue; }
      if (!entry.isFile()) throw new Error('프로젝트 패키지에 지원하지 않는 파일이 있습니다.');
      const data = await fs.readFile(filename);
      const name = Buffer.from(path.relative(path.dirname(bundle), filename).split(path.sep).join('/'));
      const stat = await fs.stat(filename);
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x800, 6);
      header.writeUInt16LE(0x21, 12); // 1980-01-01 is ZIP's earliest date.
      header.writeUInt32LE(crc32(data), 14);
      header.writeUInt32LE(data.length, 18);
      header.writeUInt32LE(data.length, 22);
      header.writeUInt16LE(name.length, 26);
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(0x0314, 4);
      header.copy(record, 6, 4, 30);
      record.writeUInt32LE((stat.mode << 16) >>> 0, 38);
      record.writeUInt32LE(offset, 42);
      local.push(header, name, data);
      central.push(record, name);
      offset += header.length + name.length + data.length;
    }
  }
  await visit(bundle);
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

module.exports = { bundleZip };
