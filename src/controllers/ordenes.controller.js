const Orden = require('../models/Orden');
const Usuario = require('../models/Usuario');
const Servicio = require('../models/Servicio');
const Prestador = require('../models/Prestador');
const { ErrorHttp } = require('../middlewares/errores');

const { TRANSICIONES } = Orden;

async function crear(req, res) {
  const { clienteId, servicioId, descripcion, modalidad, zona, direccion, fechaProgramada } =
    req.body;

  if (clienteId && !(await Usuario.exists({ _id: clienteId }))) {
    throw new ErrorHttp(400, 'El cliente indicado no existe');
  }
  if (servicioId && !(await Servicio.exists({ _id: servicioId }))) {
    throw new ErrorHttp(400, 'El servicio indicado no existe');
  }

  const orden = await Orden.create({
    clienteId,
    servicioId,
    descripcion,
    modalidad,
    zona,
    direccion,
    fechaProgramada,
    estado: 'solicitada',
    historialEstados: [
      { estado: 'solicitada', actor: { tipo: 'cliente', id: clienteId }, nota: 'Orden creada' },
    ],
  });
  res.status(201).json(orden);
}

async function listar(req, res) {
  const { clienteId, prestadorId, estado } = req.query;
  const filtro = {};
  if (clienteId) filtro.clienteId = clienteId;
  if (prestadorId) filtro.prestadorId = prestadorId;
  if (estado) filtro.estado = estado;
  const ordenes = await Orden.find(filtro).sort({ createdAt: -1 });
  res.json(ordenes);
}

async function obtener(req, res) {
  const orden = await Orden.findById(req.params.id)
    .populate('clienteId', 'nombre email')
    .populate('prestadorId', 'nombre calificacionPromedio')
    .populate('servicioId', 'nombre');
  if (!orden) throw new ErrorHttp(404, 'Orden no encontrada');
  res.json(orden);
}

async function cambiarEstado(req, res) {
  const { estado, actor, nota, prestadorId, precioAcordado, fechaProgramada } = req.body;
  if (!estado) throw new ErrorHttp(400, 'Debe indicar el nuevo estado');
  if (!actor || !actor.tipo) throw new ErrorHttp(400, 'Debe indicar el actor del cambio');

  const orden = await Orden.findById(req.params.id);
  if (!orden) throw new ErrorHttp(404, 'Orden no encontrada');

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

  orden.estado = estado;
  orden.historialEstados.push({ estado, actor, nota });
  await orden.save();
  res.json(orden);
}

module.exports = { crear, listar, obtener, cambiarEstado };
