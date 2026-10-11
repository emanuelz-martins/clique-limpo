const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const directory = path.resolve(__dirname, '../clique-limpo/icons');
const source = fs.readFileSync(path.join(directory, 'source-face.svg'), 'utf8');
const paths = [...source.matchAll(/<path\b[^>]*\/>/g)].map(match => match[0]);
const dark = paths.filter(item => item.includes('fill="#171717"'));
const interior = paths.find(item => item.includes('fill="#f7f7f7"'));
if (dark.length !== 4 || !interior) throw new Error('Geometria do ícone original não reconhecida.');

function face(active, toolbar = false) {
  // Keep the supplied outline and both eyes. Only the mouth changes expression.
  const outline = toolbar ? dark[0].replace('#171717', active ? '#e24b4b' : '#89817e') : dark[0];
  const mouth = active ? 'M 34.4 39.8 L 38.3 44.7 H 46.1 L 50 39.8' : 'M 34.4 44.7 L 38.3 39.8 H 46.1 L 50 44.7';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="3 -7.5 78 78">${outline}${interior}${dark[1]}${dark[3]}<path d="${mouth}" fill="none" stroke="#171717" stroke-width="4.175" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CLIQUE_LIMPO_BROWSER ? { executablePath: process.env.CLIQUE_LIMPO_BROWSER } : { channel: 'msedge' }),
    headless: true
  });
  try {
    for (const active of [true, false]) {
      const name = active ? 'active' : 'inactive';
      fs.writeFileSync(path.join(directory, `face-${name}.svg`), face(active));
      const output = path.join(directory, name);
      fs.mkdirSync(output, { recursive: true });
      for (const size of [16, 32, 48, 128]) {
        const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
        await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${face(active, true)}`);
        await page.screenshot({ path: path.join(output, `${size}.png`), omitBackground: true });
        await page.close();
        if (active) fs.copyFileSync(path.join(output, `${size}.png`), path.join(directory, `${size}.png`));
      }
    }
  } finally { await browser.close(); }
  console.log('Ícones feliz/triste gerados a partir da geometria original.');
})().catch(error => { console.error(error); process.exitCode = 1; });
