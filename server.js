import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.get('/healthz', (_req, res) => {
  res.type('text/plain').send('ok');
});

app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (/\.(jpe?g|png|webp|svg|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.get('*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Belajar Logika berjalan di http://localhost:${port}`);
});
