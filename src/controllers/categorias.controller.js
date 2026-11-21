const Categoria = require('../models/Categoria');
const Servicio = require('../models/Servicio');
const { ErrorHttp } = require('../middlewares/errores');

async function crear(req, res) {
  const categoria = await Categoria.create(req.body);
  res.status(201).json(categoria);
}

async function listar(req, res) {
  const filtro = {};
  if (req.query.activa !== undefined) filtro.activa = req.query.activa === 'true';
  const categorias = await Categoria.find(filtro).sort({ nombre: 1 });
  res.json(categorias);
}

async function obtener(req, res) {
  const categoria = await Categoria.findById(req.params.id);
  if (!categoria) throw new ErrorHttp(404, 'Categoria no encontrada');
  res.json(categoria);
}

async function actualizar(req, res) {
  const categoria = await Categoria.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!categoria) throw new ErrorHttp(404, 'Categoria no encontrada');
  res.json(categoria);
}

async function eliminar(req, res) {
  const enUso = await Servicio.countDocuments({ categoriaId: req.params.id });
  if (enUso > 0) {
    throw new ErrorHttp(409, `La categoria tiene ${enUso} servicio(s) asociado(s)`);
  }
  const categoria = await Categoria.findByIdAndDelete(req.params.id);
  if (!categoria) throw new ErrorHttp(404, 'Categoria no encontrada');
  res.status(204).end();
}

module.exports = { crear, listar, obtener, actualizar, eliminar };
