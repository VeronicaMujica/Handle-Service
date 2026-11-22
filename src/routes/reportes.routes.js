const { Router } = require('express');
const ctrl = require('../controllers/reportes.controller');
const { autenticar, autorizar } = require('../middlewares/autenticacion');

const router = Router();

router.use(autenticar, autorizar('admin'));

router.get('/ranking-prestadores', ctrl.rankingPrestadores);

module.exports = router;
