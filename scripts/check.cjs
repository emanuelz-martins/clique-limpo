const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'clique-limpo/manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 obrigatório');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const popup = fs.readFileSync(path.join(root, 'clique-limpo/popup.html'), 'utf8');
if (pkg.version !== manifest.version || lock.version !== manifest.version || lock.packages[''].version !== manifest.version || !popup.includes(`v${manifest.version}</span>`)) throw new Error('Versões do painel, manifesto e pacote devem coincidir');
if (manifest.description.length > 132) throw new Error('Descrição do manifesto excede 132 caracteres');
for (const file of ['LICENSE.md', 'docs/TERMOS_DE_USO.md', 'docs/PRIVACIDADE.md']) if (!fs.existsSync(path.join(root, file))) throw new Error(`Documento obrigatório ausente: ${file}`);
if (process.env.GITHUB_REF?.startsWith('refs/tags/') && process.env.GITHUB_REF !== `refs/tags/v${manifest.version}`) throw new Error('A tag deve corresponder à versão do manifesto');
const files = [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons || {}), ...manifest.content_scripts.flatMap(script => script.js), 'trackers.json', 'ad-sources.json', ...['active', 'inactive'].flatMap(state => [`icons/face-${state}.svg`, ...[16, 32, 48, 128].map(size => `icons/${state}/${size}.png`)])];
files.push('icons/github.svg', 'icons/GITHUB-LICENSE.txt', 'icons/chrome-web-store.svg');
for (const file of files) if (!fs.existsSync(path.join(root, 'clique-limpo', file))) throw new Error(`Arquivo ausente: ${file}`);
const trackers = JSON.parse(fs.readFileSync(path.join(root, 'clique-limpo/trackers.json'), 'utf8'));
if (trackers.length !== 2 || trackers[0].id !== 1000 || trackers[1].id !== 1001 || trackers.some(rule => rule.action.type !== 'block')) throw new Error('Regra de rastreamento inválida');
for (const file of fs.readdirSync(path.join(root, 'clique-limpo')).filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'clique-limpo', file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
console.log('Manifesto, arquivos e sintaxe JavaScript verificados.');
