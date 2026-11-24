const Servicio = require('../models/Servicio');
const Categoria = require('../models/Categoria');
const { ErrorHttp } = require('../middlewares/errores');

async function resolverCategoria(datos) {
  const nombre = typeof datos.categoria === 'string' ? datos.categoria.trim() : '';
  if (nombre) {
    let categoria = await Categoria.findOne({ nombre }).collation({ locale: 'es', strength: 1 });
    if (!categoria) categoria = await Categoria.create({ nombre });
    datos.categoria = categoria.nombre;
    datos.categoriaId = categoria._id;
    return;
  }

  if (datos.categoriaId) {
    const categoria = await Categoria.findById(datos.categoriaId);
    if (!categoria) throw new ErrorHttp(400, 'La categoria indicada no existe');
    datos.categoria = categoria.nombre;
  }
}

async function verificarPropietario(req, id) {
  if (req.auth.rol === 'admin') return;
  const servicio = await Servicio.findById(id);
  if (!servicio) throw new ErrorHttp(404, 'Servicio no encontrado');
  if (String(servicio.creadoPor || '') !== req.auth.id) {
    throw new ErrorHttp(403, 'Solo puedes editar los servicios que publicaste');
  }
}

async function crear(req, res) {
  const datos = { ...req.body };
  datos.creadoPor = req.auth.rol === 'admin' ? req.body.creadoPor || null : req.auth.id;
  await resolverCategoria(datos);
  const servicio = await Servicio.create(datos);
  res.status(201).json(servicio);
}

async function listar(req, res) {
  const { q, categoria, categoriaId, inusual, esInusual, modalidad, estado, activa } = req.query;
  const filtro = {};
  if (estado) filtro.estado = String(estado);
  else if (activa !== undefined) filtro.activa = activa === 'true';
  else filtro.activo = true;
  if (q) filtro.$text = { $search: q };
  if (categoria) filtro.categoria = String(categoria);
  if (categoriaId) filtro.categoriaId = categoriaId;
  if (inusual !== undefined) filtro.inusual = inusual === 'true';
  else if (esInusual !== undefined) filtro.esInusual = esInusual === 'true';
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
  await verificarPropietario(req, req.params.id);
  const datos = { ...req.body };
  delete datos.creadoPor;
  await resolverCategoria(datos);
  const servicio = await Servicio.findByIdAndUpdate(req.params.id, datos, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!servicio) throw new ErrorHttp(404, 'Servicio no encontrado');
  res.json(servicio);
}

async function eliminar(req, res) {
  await verificarPropietario(req, req.params.id);
  const servicio = await Servicio.findByIdAndDelete(req.params.id);
  if (!servicio) throw new ErrorHttp(404, 'Servicio no encontrado');
  res.status(204).end();
}

module.exports = { crear, listar, obtener, actualizar, eliminar };
