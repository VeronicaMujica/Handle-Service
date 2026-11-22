const Orden = require('../models/Orden');
const Usuario = require('../models/Usuario');
const Servicio = require('../models/Servicio');
const Prestador = require('../models/Prestador');
const { ErrorHttp } = require('../middlewares/errores');

const { TRANSICIONES } = Orden;

function esAdmin(req) {
  return req.auth.rol === 'admin';
}

async function esVisible(req, orden) {
  if (esAdmin(req)) return true;
  if (req.auth.tipo === 'usuario') return String(orden.clienteId) === req.auth.id;
  if (orden.estado === 'solicitada') return true;
  const cotizo = orden.historialEstados.some(
    (h) => h.actor?.tipo === 'prestador' && String(h.actor.id || '') === req.auth.id
  );
  return String(orden.prestadorId || '') === req.auth.id || cotizo;
}

function puedeCambiar(req, orden, estado) {
  if (esAdmin(req)) return true;
  const actual = orden.estado;
  if (req.auth.tipo === 'prestador') {
    if (actual === 'solicitada' && estado === 'cotizada') return true;
    return (
      String(orden.prestadorId || '') === req.auth.id &&
      ['agendada', 'en_ejecucion', 'finalizada'].includes(estado)
    );
  }
  if (req.auth.tipo === 'usuario' && String(orden.clienteId) === req.auth.id) {
    return ['agendada', 'asignada', 'pagada', 'calificada', 'cancelada', 'en_reclamo'].includes(estado);
  }
  return false;
}

async function crear(req, res) {
  const { clienteId, servicioId, descripcion, modalidad, zona, direccion, fechaProgramada } =
    req.body;

  let idCliente;
  if (esAdmin(req)) idCliente = clienteId;
  else if (req.auth.tipo === 'usuario') idCliente = req.auth.id;
  else throw new ErrorHttp(403, 'Los prestadores no pueden crear ordenes');

  if (!idCliente) throw new ErrorHttp(400, 'Debe indicar el cliente de la orden');
  if (!(await Usuario.exists({ _id: idCliente }))) {
    throw new ErrorHttp(400, 'El cliente indicado no existe');
  }
  if (servicioId && !(await Servicio.exists({ _id: servicioId }))) {
    throw new ErrorHttp(400, 'El servicio indicado no existe');
  }

  const orden = await Orden.create({
    clienteId: idCliente,
    servicioId,
    descripcion,
    modalidad,
    zona,
    direccion,
    fechaProgramada,
    estado: 'solicitada',
    historialEstados: [
      { estado: 'solicitada', actor: { tipo: 'cliente', id: idCliente }, nota: 'Orden creada' },
    ],
  });
  res.status(201).json(orden);
}

async function listar(req, res) {
  const filtro = {};
  if (esAdmin(req)) {
    const { clienteId, prestadorId, estado } = req.query;
    if (clienteId) filtro.clienteId = clienteId;
    if (prestadorId) filtro.prestadorId = prestadorId;
    if (estado) filtro.estado = estado;
  } else if (req.auth.tipo === 'usuario') {
    filtro.clienteId = req.auth.id;
    if (req.query.estado) filtro.estado = req.query.estado;
  } else {
    filtro.$or = [
      { prestadorId: req.auth.id },
      { estado: 'solicitada' },
      {
        'historialEstados.actor.tipo': 'prestador',
        'historialEstados.actor.id': req.auth.id,
      },
    ];
    if (req.query.estado) filtro.estado = req.query.estado;
  }

  const ordenes = await Orden.find(filtro).sort({ createdAt: -1 });
  res.json(ordenes);
}

async function obtener(req, res) {
  const orden = await Orden.findById(req.params.id)
    .populate('clienteId', 'nombre email')
    .populate('prestadorId', 'nombre calificacionPromedio')
    .populate('servicioId', 'nombre');
  if (!orden) throw new ErrorHttp(404, 'Orden no encontrada');
  if (!(await esVisible(req, orden))) {
    throw new ErrorHttp(403, 'No tiene permisos para ver esta orden');
  }
  res.json(orden);
}

async function cambiarEstado(req, res) {
  const { estado, nota, prestadorId, precioAcordado, fechaProgramada } = req.body;
  if (!estado) throw new ErrorHttp(400, 'Debe indicar el nuevo estado');

  const orden = await Orden.findById(req.params.id);
  if (!orden) throw new ErrorHttp(404, 'Orden no encontrada');
  if (!(await esVisible(req, orden)) || !puedeCambiar(req, orden, estado)) {
    throw new ErrorHttp(403, `No tiene permisos para llevar la orden a "${estado}"`);
  }

  const permitidos = TRANSICIONES[orden.estado] || [];
  if (!permitidos.includes(estado)) {
    throw new ErrorHttp(
      409,
      `No se puede pasar de "${orden.estado}" a "${estado}". Permitidos: ${
        permitidos.join(', ') || 'ninguno'
      }`
    );
  }

  if (estado === 'asignada') {
    if (!prestadorId) throw new ErrorHttp(400, 'Para asignar la orden se requiere prestadorId');
    if (!(await Prestador.exists({ _id: prestadorId }))) {
      throw new ErrorHttp(400, 'El prestador indicado no existe');
    }
    orden.prestadorId = prestadorId;
  }
  if (precioAcordado !== undefined) orden.precioAcordado = precioAcordado;
  if (fechaProgramada !== undefined) orden.fechaProgramada = fechaProgramada;

  const tipoActor = req.auth.tipo === 'usuario' ? 'cliente' : req.auth.tipo;
  const actor = esAdmin(req)
    ? { tipo: 'sistema' }
    : { tipo: tipoActor, id: req.auth.id };
  orden.estado = estado;
  orden.historialEstados.push({ estado, actor, nota });
  await orden.save();
  res.json(orden);
}

module.exports = { crear, listar, obtener, cambiarEstado };
