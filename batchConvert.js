const fs = require('fs');
const path = require('path');
const xmlConverter = require('./xmlConverter');
const ftp = require('basic-ftp');
const { Readable } = require('stream');

async function uploadToFtp(xmlString, remoteFile) {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'ftp-config.json'), 'utf-8'));
    const client = new ftp.Client();
    client.ftp.verbose = false;
    try {
        await client.access({
            host: config.host,
            user: config.user,
            password: config.password,
            secure: config.secure
        });
        if (config.remoteDir) {
            await client.ensureDir(config.remoteDir);
            await client.cd(config.remoteDir);
        }
        // Buffer yerine Readable stream kullan
        const stream = Readable.from([xmlString]);
        await client.uploadFrom(stream, remoteFile);
        console.log(`FTP'ye yüklendi: ${remoteFile}`);
    } catch (err) {
        console.error(`FTP yükleme hatası: ${err.message}`);
    }
    client.close();
}

async function main() {
    const urlsFile = path.join(__dirname, 'urls.txt');
    if (!fs.existsSync(urlsFile)) {
        console.error('urls.txt bulunamadı!');
        return;
    }

    // Her satır: URL [boşluk] DOSYAADI.xml
    const lines = fs.readFileSync(urlsFile, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));

    for (const line of lines) {
        // Satırı ayır: ilk boşluğa kadar URL, sonrası dosya adı
        const [url, ...rest] = line.split(/\s+/);
        const fileName = rest.join(' ');
        if (!url || !fileName) {
            console.error(`Satır hatalı: ${line}`);
            continue;
        }
        try {
            console.log(`Dönüştürülüyor: ${url} → ${fileName}`);
            const convertedXml = await xmlConverter.convertToTemplate(url);
            await uploadToFtp(convertedXml, fileName);
        } catch (err) {
            console.error(`Hata (${url}): ${err.message}`);
        }
    }
}

main();