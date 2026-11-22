const { Router } = require('express');
const ctrl = require('../controllers/usuarios.controller');
const { autenticar, autorizar } = require('../middlewares/autenticacion');

const router = Router();

router.post('/', autenticar, autorizar('admin'), ctrl.crear);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.put('/:id', autenticar, ctrl.actualizar);
router.delete('/:id', autenticar, ctrl.eliminar);

module.exports = router;
