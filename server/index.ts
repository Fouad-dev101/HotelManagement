import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);
createApp().listen(PORT, '127.0.0.1', () => {
  console.log(`Hotelyx API sur http://127.0.0.1:${PORT}`);
});