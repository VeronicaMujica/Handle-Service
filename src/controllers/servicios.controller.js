const Servicio = require('../models/Servicio');
const Categoria = require('../models/Categoria');
const { ErrorHttp } = require('../middlewares/errores');

async function validarCategoria(categoriaId) {
  if (categoriaId === undefined) return;
  const existe = await Categoria.exists({ _id: categoriaId });
  if (!existe) throw new ErrorHttp(400, 'La categoria indicada no existe');
}

// La categoria la escribe quien publica: se reutiliza si ya existe (sin distinguir
// mayusculas ni tildes) y se crea si no
async function resolverCategoria(body) {
  if (typeof body.categoria === 'string' && body.categoria.trim()) {
    const nombre = body.categoria.trim();
    let categoria = await Categoria.findOne({ nombre }).collation({ locale: 'es', strength: 1 });
    if (!categoria) categoria = await Categoria.create({ nombre });
    body.categoriaId = categoria._id;
  }
  delete body.categoria;
  await validarCategoria(body.categoriaId);
}

async function crear(req, res) {
  await resolverCategoria(req.body);
  const servicio = await Servicio.create(req.body);
  res.status(201).json(servicio);
}

async function listar(req, res) {
  const { q, categoriaId, inusual, modalidad } = req.query;
  const filtro = { activo: true };
  if (q) filtro.$text = { $search: q };
  if (categoriaId) filtro.categoriaId = categoriaId;
  if (inusual !== undefined) filtro.esInusual = inusual === 'true';
  if (modalidad) filtro.modalidades = modalidad;

  const servicios = await Servicio.find(filtro)
    .populate('categoriaId', 'nombre')
    .sort({ nombre: 1 });
  res.json(servicios);
}

async function obtener(req, res) {
  const servicio = await Servicio.findById(req.params.id).populate('categoriaId', 'nombre');
  if (!servicio) throw new ErrorHttp(404, 'Servicio no encontrado');
  res.json(servicio);
}

async function actualizar(req, res) {
  await resolverCategoria(req.body);
  const servicio = await Servicio.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!servicio) throw new ErrorHttp(404, 'Servicio no encontrado');
  res.json(servicio);
}

async function eliminar(req, res) {
  const servicio = await Servicio.findByIdAndDelete(req.params.id);
  if (!servicio) throw new ErrorHttp(404, 'Servicio no encontrado');
  res.status(204).end();
}

module.exports = { crear, listar, obtener, actualizar, eliminar };
