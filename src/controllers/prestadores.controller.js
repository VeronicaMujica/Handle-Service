const Prestador = require('../models/Prestador');
const Servicio = require('../models/Servicio');
const { ErrorHttp } = require('../middlewares/errores');
const { hashearPassword } = require('../utils/password');
const { esPropioOAdmin } = require('../middlewares/autenticacion');

const CAMPOS_PUBLICOS = [
  'nombre',
  'email',
  'telefono',
  'documento',
  'descripcion',
  'ciudad',
  'zonas',
  'serviciosOfrecidos',
  'certificaciones',
  'password',
];
const CAMPOS_PRIVILEGIADOS = [
  'rol',
  'estado',
  'calificacionPromedio',
  'totalCalificaciones',
  'passwordHash',
];

async function validarServicios(serviciosOfrecidos) {
  if (!Array.isArray(serviciosOfrecidos) || serviciosOfrecidos.length === 0) return;
  const ids = [...new Set(serviciosOfrecidos.map((s) => String(s.servicioId)))];
  const encontrados = await Servicio.countDocuments({ _id: { $in: ids } });
  if (encontrados !== ids.length) {
    throw new ErrorHttp(400, 'Uno o mas servicios ofrecidos no existen en el catalogo');
  }
}

function filtrar(body, campos) {
  return Object.fromEntries(campos.filter((c) => body[c] !== undefined).map((c) => [c, body[c]]));
}

async function prepararDatos(body, esAdmin) {
  const datos = filtrar(body, esAdmin ? [...CAMPOS_PUBLICOS, ...CAMPOS_PRIVILEGIADOS] : CAMPOS_PUBLICOS);
  if (datos.password) {
    datos.passwordHash = await hashearPassword(datos.password);
    delete datos.password;
  }
  return datos;
}

async function crear(req, res) {
  const datos = await prepararDatos(req.body, false);
  await validarServicios(datos.serviciosOfrecidos);
  const prestador = await Prestador.create(datos);
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
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes editar tu propio perfil');
  }
  const datos = await prepararDatos(req.body, req.auth.rol === 'admin');
  await validarServicios(datos.serviciosOfrecidos);
  const prestador = await Prestador.findByIdAndUpdate(req.params.id, datos, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!prestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.json(prestador);
}

async function eliminar(req, res) {
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes eliminar tu propio perfil');
  }
  const prestador = await Prestador.findByIdAndDelete(req.params.id);
  if (!prestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.status(204).end();
}

async function agregarCertificacion(req, res) {
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes agregar certificaciones a tu propio perfil');
  }
  const prestador = await Prestador.findById(req.params.id);
  if (!prestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  prestador.certificaciones.push(req.body);
  await prestador.save();
  res.status(201).json(prestador);
}

module.exports = {
  crear,
  listar,
  obtener,
  actualizar,
  eliminar,
  agregarCertificacion,
  validarServicios,
};
