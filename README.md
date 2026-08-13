# Controle de Armários

App web (PWA) para controlar armários por alojamento, com status colorido
(livre, ocupado, sem identificação), controle de cadeados e alerta de
pessoas com mais de um armário. Funciona 100% offline, os dados ficam
salvos no próprio aparelho (localStorage).

## Estrutura

```
armario-app/
├── index.html
├── manifest.json
├── sw.js                  (service worker – cache offline)
├── css/style.css
├── js/app.js               (toda a lógica do app)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-maskable-512.png
```

## 1. Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (ex.: `controle-armarios`).
2. Envie todos os arquivos desta pasta para a raiz do repositório:
   ```bash
   git init
   git add .
   git commit -m "Controle de armários - versão inicial"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/controle-armarios.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Source**, selecione a branch `main` e a
   pasta `/ (root)`. Salve.
4. Em alguns minutos o app estará disponível em:
   `https://SEU_USUARIO.github.io/controle-armarios/`
5. Abra esse link no celular — o app já funciona como site. Para "instalar"
   como aplicativo (ícone na tela, tela cheia), use "Adicionar à tela
   inicial" no menu do navegador.

> Importante: o `manifest.json` usa caminhos relativos (`./`), então funciona
> tanto na raiz de um domínio quanto em um subcaminho como o do GitHub Pages
> (`/controle-armarios/`).

## 2. Gerar o APK com o PWABuilder

1. Acesse **https://www.pwabuilder.com**.
2. Cole a URL publicada no GitHub Pages (passo acima) e clique em **Start**.
3. O PWABuilder vai analisar o `manifest.json` e o `sw.js` automaticamente.
   Confira se os três "cartões" (Manifest, Service Worker, Segurança/HTTPS)
   aparecem com o status verde.
4. Clique em **Package for stores → Android**.
5. Mantenha as opções padrão (pode ajustar nome do pacote, ex.:
   `com.seudominio.controlearmarios`) e gere o pacote.
6. Baixe o `.zip`, dentro dele está o **APK** (e/ou `.aab` para publicar na
   Play Store) pronto para instalar no celular.

## 3. Atualizações

Sempre que você editar os arquivos e enviar (`git push`) para o GitHub,
o site do GitHub Pages atualiza sozinho em alguns minutos. Se o app já
tiver sido instalado como PWA, ele vai buscar a nova versão automaticamente
(o `sw.js` cuida do cache). Se você gerou um APK, o conteúdo dentro dele é
carregado a partir do site — ou seja, atualizando o site, o APK instalado
também passa a mostrar a versão nova (não precisa gerar um novo APK a cada
mudança, só quando quiser mudar nome, ícone, versão etc. na loja).

## Como usar o app

- **Painel**: totais gerais e lista dos alojamentos, cada um com uma barrinha
  colorida mostrando a proporção livre/ocupado/sem identificação.
- Toque em um alojamento para ver a grade de armários. Toque em um armário
  para definir o status e, se ocupado, o nome da pessoa. Se a pessoa já tiver
  outro armário, um aviso aparece e o armário ganha um selo "2×".
- **Cadeados**: registre cadeado nº, alojamento e armário. A tabela mostra o
  status do armário vinculado e avisa cadeados com número duplicado.
- **Pessoas**: lista quem está com 2 ou mais armários.
- **Ajustes**: renomear/excluir alojamentos, adicionar armários em lote,
  exportar/importar backup em `.json` e limpar todos os dados.

## Observações técnicas

- Não há backend: tudo é salvo em `localStorage` no navegador/dispositivo.
  Se for usar em vários aparelhos ao mesmo tempo, use "Exportar dados" para
  levar o backup de um para outro (não há sincronização automática entre
  dispositivos).
- Sem dependências externas além das fontes do Google Fonts (carregadas uma
  vez e cacheadas pelo navegador).
