const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const protobuf = require('protobufjs');

const backupPath = path.resolve(__dirname, '../eu.kanade.tachiyomi.sy_2026-01-04_09-16.tachibk');
const protoPath = path.resolve(__dirname, 'backup.proto');
const outputPath = path.resolve(__dirname, '../backup.json');

async function convert() {
    console.log(`Loading proto from ${protoPath}`);
    const root = await protobuf.load(protoPath);
    const Backup = root.lookupType("Backup"); // Since no package defined

    console.log(`Reading backup file from ${backupPath}`);
    if (!fs.existsSync(backupPath)) {
        console.error(`File not found: ${backupPath}`);
        return;
    }
    let buffer = fs.readFileSync(backupPath);

    // Check gzip magic bytes 1f 8b
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        console.log("Detected GZIP compression, decompressing...");
        buffer = zlib.gunzipSync(buffer);
    }

    try {
        console.log("Decoding protobuf...");
        const message = Backup.decode(buffer);
        console.log("Converting to object...");
        const object = Backup.toObject(message, {
            longs: String,
            enums: String,
            bytes: String,
        });

        fs.writeFileSync(outputPath, JSON.stringify(object, null, 2));
        console.log(`Conversion successful! Saved to ${outputPath}`);
    } catch (e) {
        console.error("Error decoding backup:", e);
    }
}

convert();
