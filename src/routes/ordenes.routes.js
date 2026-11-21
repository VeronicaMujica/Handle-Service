const { Router } = require('express');
const ctrl = require('../controllers/ordenes.controller');

const router = Router();

router.post('/', ctrl.crear);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.patch('/:id/estado', ctrl.cambiarEstado);

module.exports = router;
