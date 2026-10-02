// PNG и PDF сертификата. Запуск — копией из %TEMP%/pw (там playwright-core): node gift-us.mjs OUT_DIR "Имя" "Номер" "Срок"; локальный сервер из корня репозитория: python -m http.server 8080
import { chromium } from 'playwright-core';
const [out = '.', to = '', no = 'GRN-US-0001', until = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await (await b.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 })).newPage();
const q = new URLSearchParams({ to, no, until });
await p.goto('http://localhost:8080/docs/gift-us/certificate-us.html?' + q, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.locator('.cert').screenshot({ path: `${out}/Geroenok-Gift-Certificate.png` });
await p.pdf({ path: `${out}/Geroenok-Gift-Certificate.pdf`, width: '1600px', height: '1100px', printBackground: true, pageRanges: '1' });
await b.close();
