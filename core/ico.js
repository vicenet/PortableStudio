// Builds a favicon.ico from PNG files (ICO containers may embed PNG data directly).
'use strict';
const fs = require('fs');

function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function buildIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngBuffers.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngBuffers.length;
  for (const png of pngBuffers) {
    const { width, height } = pngSize(png);
    const e = Buffer.alloc(16);
    e.writeUInt8(width >= 256 ? 0 : width, 0);
    e.writeUInt8(height >= 256 ? 0 : height, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

function writeIco(pngFiles, dest) {
  fs.writeFileSync(dest, buildIco(pngFiles.map((f) => fs.readFileSync(f))));
  return dest;
}

module.exports = { buildIco, writeIco, pngSize };
