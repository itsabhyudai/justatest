const { openDatabase } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;

const db = openDatabase();
const server = createApp({ db });

server.listen(PORT, () => {
  console.log(`Task manager API listening on http://localhost:${PORT}`);
});
