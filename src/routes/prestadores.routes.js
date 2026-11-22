const { Router } = require('express');
const ctrl = require('../controllers/prestadores.controller');
const { autenticar } = require('../middlewares/autenticacion');

const router = Router();

router.post('/', ctrl.crear);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.put('/:id', autenticar, ctrl.actualizar);
router.delete('/:id', autenticar, ctrl.eliminar);
router.post('/:id/certificaciones', autenticar, ctrl.agregarCertificacion);

module.exports = router;
