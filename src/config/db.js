const mongoose = require('mongoose');

async function conectarDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Falta la variable MONGODB_URI en el archivo .env');
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] conexion perdida');
  });

  await mongoose.connect(uri);
  const { host, port, name } = mongoose.connection;
  console.log(`[MongoDB] conectado a ${host}:${port}/${name}`);
}

module.exports = conectarDB;
