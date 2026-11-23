const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');
const { autenticar } = require('../middlewares/autenticacion');

const router = Router();

router.post('/registro', ctrl.registrar);
router.post('/login', ctrl.login);
router.get('/yo', autenticar, ctrl.yo);

module.exports = router;
