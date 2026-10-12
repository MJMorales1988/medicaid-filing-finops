import { build } from 'esbuild';
import fs from 'fs';

const r = await build({
  entryPoints: ["src/main.jsx"], bundle: true, write: false, format: 'iife', minify: true, target: 'es2019',
  jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', legalComments: 'none',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8') + '\n.skip{position:absolute;left:-999px;top:0;background:#fff;color:#000;padding:8px;z-index:300}.skip:focus{left:8px;top:8px}\n';
const html = `<title>Medicaid Filing - Financial Operations</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;
fs.writeFileSync('dist.html', html);
console.log('dist.html', (html.length / 1024).toFixed(0) + ' KB');
