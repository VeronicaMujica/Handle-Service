const { Router } = require('express');
const ctrl = require('../controllers/usuarios.controller');

const router = Router();

router.post('/', ctrl.crear);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
