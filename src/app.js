const path = require('path');
const express = require('express');
const rutas = require('./routes');
const { rutaNoEncontrada, manejadorErrores } = require('./middlewares/errores');

const app = express();

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', rutas);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);

module.exports = app;
