# Desenvolvimento

A extensão utiliza JavaScript, HTML e CSS com Manifest V3, sem compilação. Node.js e Playwright são utilizados somente nos testes; Python 3 gera os ZIPs sem dependências adicionais.

## Preparar e testar

No Windows com Edge instalado:

```powershell
npm.cmd ci
$env:CLIQUE_LIMPO_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm.cmd run check
npm.cmd test
```

Os testes criam perfis temporários e usam páginas locais simuladas. Outro navegador Chromium compatível com extensões descompactadas pode ser indicado pela variável `CLIQUE_LIMPO_BROWSER`.

Os arquivos de testes de navegador executam em sequência: eles dependem de foco e de abas ativas, e abrir vários perfis simultaneamente disputa recursos do runner. Os cenários continuam verificando navegação e interações entre várias abas dentro do mesmo perfil.

| Comando | Finalidade |
| --- | --- |
| `npm run check` | Confere versões, manifesto, arquivos e sintaxe. |
| `npm test` | Executa testes de proteção, navegação, painel e dicas. |
| `npm run test:design` | Verifica o painel e captura imagens. |
| `npm run test:pages` | Verifica ativação e navegação por abas e origem. |
| `npm run test:tips` | Verifica orientação, avisos, dispensa e frequência. |
| `npm run test:popups` | Reproduz a corrida de iframe do TopFlix, testa contenção, carregadores e aberturas legítimas. |
| `npm run demo` | Serve a demonstração em `http://127.0.0.1:4173`. |
| `npm run icons` | Gera PNGs a partir dos SVGs do projeto. |
| `python scripts/package.py` | Gera os ZIPs e somas SHA-256 em `dist/`. |

## Código

- `background.js`: ativação, navegação, rede, ícones e frequência das dicas.
- `detector.js`: heurísticas de inspeção dos elementos.
- `content.js`: varredura, ocultação, restauração, seleção manual e estado do documento.
- `popup-guard.js`: interceptadores no contexto da página e ajustes de players.
- `popup-policy.js`: classificação local de destinos e sites com contenção restrita de novas abas.
- `tips.js`: inspeção passiva e avisos de orientação.
- `popup.html`, `popup.css`, `popup.js`: interface e comandos do painel.
- `trackers.json`, `ad-sources.json`: regras locais de rede.

Mudanças devem preservar controles de players, eventos legítimos, desativação manual e navegação por abas. Depois de editar os arquivos, recarregue o cartão da extensão e as páginas abertas.

## Versões

A cada atualização entregue, incremente o último número: `1.0.1`, `1.0.2`, `1.0.3` e assim por diante. Essas versões identificam o ciclo de correções e validação pelo mantenedor. Só altere para `1.1.0` quando ele pedir explicitamente; uma bateria de testes aprovada não substitui essa decisão.

Mantenha a mesma versão no manifesto, indicador de `popup.html`, `package.json` e nas duas entradas do projeto em `package-lock.json`. Atualize README e imagens quando a interface mudar.

Uma tag `vX.Y.Z` deve corresponder à versão do manifesto. A verificação do GitHub Actions rejeita tags divergentes. Veja o [guia de publicação](PUBLICACAO.md).
