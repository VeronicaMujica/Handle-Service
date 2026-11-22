const { Router, json } = require('express');
const mongoose = require('mongoose');

const router = Router();

// Las fotos llegan en base64 y superan el limite de 100 kb del resto de la API
router.use('/imagenes', json({ limit: '4mb' }), require('./imagenes.routes'));

router.use(json());

router.get('/health', (req, res) => {
  const estados = ['desconectado', 'conectado', 'conectando', 'desconectando'];
  res.json({
    servicio: 'Handle Service API',
    mongodb: estados[mongoose.connection.readyState],
    fecha: new Date(),
  });
});

router.use('/categorias', require('./categorias.routes'));
router.use('/servicios', require('./servicios.routes'));
router.use('/prestadores', require('./prestadores.routes'));
router.use('/usuarios', require('./usuarios.routes'));
router.use('/ordenes', require('./ordenes.routes'));

module.exports = router;
