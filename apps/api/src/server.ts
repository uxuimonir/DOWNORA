import { createApp } from './app';

const app = await createApp();
app.server.listen(app.config.port, () => {
  console.log(`Downora API on http://localhost:${app.config.port}`);
  console.log(`FFmpeg: ${app.media.ffmpeg ? `${app.media.ffmpeg.version} (${app.media.outputs().join(', ')})` : 'not found — conversion disabled'}`);
  if (app.config.allowPrivateHosts.length) console.warn(`DEV ONLY: SSRF guard allows ${app.config.allowPrivateHosts.join(', ')}`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void app.close().then(() => process.exit(0)));
