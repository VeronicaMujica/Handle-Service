const { Router } = require('express');
const ctrl = require('../controllers/imagenes.controller');

const router = Router();

router.post('/', ctrl.subir);

module.exports = router;
