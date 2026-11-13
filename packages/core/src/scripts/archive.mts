import { crc32, deflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const compress=promisify(deflateRaw);

/** One self-contained HTML document in a standard ZIP; no external tool is needed. */
export async function zipHtml(name: string,source: Buffer): Promise<Buffer>{
  if(!/^[^/\\]+\.html$/i.test(name))throw Error('ZIP requires a root HTML filename');
  const filename=Buffer.from(name,'utf8'),compressed=await compress(source,{level:9}),checksum=crc32(source);
  if(source.length>0xffffffff||compressed.length>0xffffffff||filename.length>0xffff)throw Error('HTML exceeds ZIP format limits');
  const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);
  local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(source.length,22);local.writeUInt16LE(filename.length,26);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);
  central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(source.length,24);central.writeUInt16LE(filename.length,28);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+compressed.length,16);
  return Buffer.concat([local,filename,compressed,central,filename,end]);
}
