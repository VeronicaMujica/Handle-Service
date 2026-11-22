const Prestador = require('../models/Prestador');
const Servicio = require('../models/Servicio');
const { ErrorHttp } = require('../middlewares/errores');

async function validarServicios(serviciosOfrecidos) {
  if (!Array.isArray(serviciosOfrecidos) || serviciosOfrecidos.length === 0) return;
  const ids = [...new Set(serviciosOfrecidos.map((s) => String(s.servicioId)))];
  const encontrados = await Servicio.countDocuments({ _id: { $in: ids } });
  if (encontrados !== ids.length) {
    throw new ErrorHttp(400, 'Uno o mas servicios ofrecidos no existen en el catalogo');
  }
}

async function crear(req, res) {
  await validarServicios(req.body.serviciosOfrecidos);
  const prestador = await Prestador.create(req.body);
  res.status(201).json(prestador);
}

async function listar(req, res) {
  const { servicioId, zona, estado } = req.query;
  const filtro = {};
  if (servicioId) filtro['serviciosOfrecidos.servicioId'] = servicioId;
  if (zona) filtro.zonas = zona;
  if (estado) filtro.estado = estado;

  const prestadores = await Prestador.find(filtro).sort({ calificacionPromedio: -1, nombre: 1 });
  res.json(prestadores);
}

async function obtener(req, res) {
  const prestador = await Prestador.findById(req.params.id).populate(
    'serviciosOfrecidos.servicioId',
    'nombre esInusual'
  );
  if (!prestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.json(prestador);
}

async function actualizar(req, res) {
  await validarServicios(req.body.serviciosOfrecidos);
  const prestador = await Prestador.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!prestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.json(prestador);
}

async function eliminar(req, res) {
  const prestador = await Prestador.findByIdAndDelete(req.params.id);
  if (!prestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.status(204).end();
}

async function agregarCertificacion(req, res) {
  const prestador = await Prestador.findById(req.params.id);
  if (!prestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  prestador.certificaciones.push(req.body);
  await prestador.save();
  res.status(201).json(prestador);
}

module.exports = { crear, listar, obtener, actualizar, eliminar, agregarCertificacion };
