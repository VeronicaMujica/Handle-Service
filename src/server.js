require('dotenv').config({ quiet: true });
const app = require('./app');
const conectarDB = require('./config/db');

const PORT = process.env.PORT || 3000;

async function iniciar() {
  try {
    await conectarDB();
    app.listen(PORT, () => {
      console.log(`[API] Handle Service escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('[API] No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
}

iniciar();
