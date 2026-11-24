const Categoria = require('../models/Categoria');
const Servicio = require('../models/Servicio');
const { ErrorHttp } = require('../middlewares/errores');

function filtroActivo(query) {
  if (query.estado !== undefined) return { estado: String(query.estado) };
  if (query.activa !== undefined) return { activa: query.activa === 'true' };
  return {};
}

async function crear(req, res) {
  const categoria = await Categoria.create(req.body);
  res.status(201).json(categoria);
}

async function listar(req, res) {
  const categorias = await Categoria.find(filtroActivo(req.query)).sort({ nombre: 1 });
  res.json(categorias);
}

async function obtener(req, res) {
  const categoria = await Categoria.findById(req.params.id);
  if (!categoria) throw new ErrorHttp(404, 'Categoria no encontrada');
  res.json(categoria);
}

async function actualizar(req, res) {
  const anterior = await Categoria.findById(req.params.id);
  if (!anterior) throw new ErrorHttp(404, 'Categoria no encontrada');

  const categoria = await Categoria.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true,
  });

  // Las referencias por nombre se actualizan para no dejar servicios huérfanos.
  if (req.body.nombre && req.body.nombre !== anterior.nombre) {
    await Servicio.updateMany(
      { $or: [{ categoria: anterior.nombre }, { categoriaId: anterior._id }] },
      { $set: { categoria: categoria.nombre } }
    );
  }
  res.json(categoria);
}

async function eliminar(req, res) {
  const categoria = await Categoria.findById(req.params.id);
  if (!categoria) throw new ErrorHttp(404, 'Categoria no encontrada');

  // RF-05: la categoria solo se elimina si ningún servicio la referencia,
  // ya sea por nombre (formato nuevo) o por id (formato anterior).
  const enUso = await Servicio.countDocuments({
    $or: [{ categoria: categoria.nombre }, { categoriaId: categoria._id }],
  });
  if (enUso > 0) {
    throw new ErrorHttp(409, `La categoria tiene ${enUso} servicio(s) asociado(s)`);
  }

  await Categoria.findByIdAndDelete(req.params.id);
  res.status(204).end();
}

module.exports = { crear, listar, obtener, actualizar, eliminar };
