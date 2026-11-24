const Orden = require('../models/Orden');
const Usuario = require('../models/Usuario');
const Servicio = require('../models/Servicio');
const { ErrorHttp } = require('../middlewares/errores');
const { tieneRol } = require('../middlewares/autenticacion');

const { TRANSICIONES, ESTADOS_ASIGNACION } = Orden;

const idDe = (valor) => String(valor?._id || valor || '');

function esAdmin(req) {
  return tieneRol(req, 'admin');
}

function puedeCrearOrden(req) {
  return esAdmin(req) || tieneRol(req, 'cliente');
}

async function esVisible(req, orden) {
  if (esAdmin(req)) return true;
  if (tieneRol(req, 'cliente') && !tieneRol(req, 'prestador')) {
    return idDe(orden.cliente || orden.clienteId) === req.auth.id;
  }
  if (orden.estado === 'solicitada') return true;
  const cotizo = orden.historialEstados.some(
    (h) => h.actor?.tipo === 'prestador' && idDe(h.actor.id) === req.auth.id
  );
  return idDe(orden.prestador || orden.prestadorId) === req.auth.id || cotizo;
}

function puedeCambiar(req, orden, estado) {
  if (esAdmin(req)) return true;
  const actual = orden.estado;
  if (tieneRol(req, 'prestador')) {
    if (actual === 'solicitada' && estado === 'cotizada') return true;
    return (
      idDe(orden.prestador || orden.prestadorId) === req.auth.id &&
      ['agendada', 'en_ejecucion', 'finalizada'].includes(estado)
    );
  }
  if (tieneRol(req, 'cliente') && idDe(orden.cliente || orden.clienteId) === req.auth.id) {
    return [
      'agendada',
      'asignada',
      'aceptada',
      'pagada',
      'calificada',
      'cancelada',
      'en_reclamo',
    ].includes(estado);
  }
  return false;
}

function calcularPenalizacion(orden) {
  const tarifa = orden.snapshot?.tarifa ?? orden.precioAcordado ?? 0;
  if (!orden.fechaProgramada || !tarifa) return 0;
  const horas = (new Date(orden.fechaProgramada).getTime() - Date.now()) / 3600000;
  if (horas >= 24) return 0;
  if (horas >= 2) return Math.round(tarifa * 0.2);
  return Math.round(tarifa * 0.5);
}

async function crear(req, res) {
  const {
    cliente,
    clienteId,
    servicio,
    servicioId,
    descripcion,
    descripcionSolicitud,
    modalidad,
    zona,
    direccion,
    fechaProgramada,
  } = req.body;

  let idCliente;
  if (esAdmin(req)) idCliente = cliente || clienteId;
  else if (puedeCrearOrden(req)) idCliente = req.auth.id;
  else throw new ErrorHttp(403, 'Los prestadores no pueden crear ordenes');

  const idServicio = servicio || servicioId;
  if (!idCliente) throw new ErrorHttp(400, 'Debe indicar el cliente de la orden');
  if (!idServicio) throw new ErrorHttp(400, 'Debe indicar el servicio de la orden');
  if (!(await Usuario.exists({ _id: idCliente }))) {
    throw new ErrorHttp(400, 'El cliente indicado no existe');
  }
  if (!(await Servicio.exists({ _id: idServicio }))) {
    throw new ErrorHttp(400, 'El servicio indicado no existe');
  }

  const orden = await Orden.create({
    cliente: idCliente,
    clienteId: idCliente,
    servicio: idServicio,
    servicioId: idServicio,
    descripcion: descripcion || descripcionSolicitud,
    modalidad,
    zona,
    direccion,
    fechaProgramada,
    estado: 'solicitada',
    snapshot: { descripcionSolicitud: descripcion || descripcionSolicitud, modalidad, zona },
    historialEstados: [
      { estado: 'solicitada', actor: { tipo: 'cliente', id: idCliente }, nota: 'Orden creada' },
    ],
  });
  res.status(201).json(orden);
}

async function listar(req, res) {
  const filtro = {};
  if (esAdmin(req)) {
    const { cliente, clienteId, prestador, prestadorId, estado } = req.query;
    if (cliente || clienteId) filtro.cliente = cliente || clienteId;
    if (prestador || prestadorId) filtro.prestador = prestador || prestadorId;
    if (estado) filtro.estado = estado;
  } else if (tieneRol(req, 'cliente') && !tieneRol(req, 'prestador')) {
    filtro.cliente = req.auth.id;
    if (req.query.estado) filtro.estado = req.query.estado;
  } else {
    filtro.$or = [
      { prestador: req.auth.id },
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
    .populate('cliente', 'nombre email')
    .populate('clienteId', 'nombre email')
    .populate('prestador', 'nombre')
    .populate('prestadorId', 'nombre')
    .populate('servicio', 'nombre')
    .populate('servicioId', 'nombre');
  if (!orden) throw new ErrorHttp(404, 'Orden no encontrada');
  if (!(await esVisible(req, orden))) {
    throw new ErrorHttp(403, 'No tiene permisos para ver esta orden');
  }
  res.json(orden);
}

async function registrarCalificacion(orden, puntaje, comentario) {
  if (puntaje === undefined) return;
  orden.calificacion = { puntaje, comentario, fecha: new Date() };

  const idPrestador = idDe(orden.prestador || orden.prestadorId);
  if (!idPrestador) return;
  const prestador = await Usuario.findById(idPrestador);
  if (!prestador?.perfilPrestador) return;

  const calificacion = prestador.perfilPrestador.calificacion || { promedio: 0, total: 0 };
  const total = (calificacion.total || 0) + 1;
  const promedio = ((calificacion.promedio || 0) * (total - 1) + Number(puntaje)) / total;
  prestador.perfilPrestador.calificacion = { promedio, total };
  await prestador.save();
}

async function cambiarEstado(req, res) {
  const {
    estado,
    nota,
    prestador,
    prestadorId,
    precioAcordado,
    fechaProgramada,
    razon,
    penalizacion,
    puntaje,
    comentario,
  } = req.body;
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

  if (ESTADOS_ASIGNACION.includes(estado)) {
    const idPrestador = prestador || prestadorId;
    if (!idPrestador) throw new ErrorHttp(400, 'Para asignar la orden se requiere prestador');
    const candidato = await Usuario.findById(idPrestador);
    if (!candidato?.perfilPrestador) {
      throw new ErrorHttp(400, 'El prestador indicado no existe');
    }
    orden.prestador = candidato._id;
    orden.prestadorId = candidato._id;
    orden.snapshot.nombrePrestador = candidato.nombre;
    const oferta = candidato.perfilPrestador.servicios.find(
      (s) => String(s._id) === String(orden.servicio || orden.servicioId)
    );
    orden.snapshot.tarifa =
      oferta?.tarifa ?? oferta?.tarifaBase ?? precioAcordado ?? orden.precioAcordado;
  }
  if (precioAcordado !== undefined) {
    orden.precioAcordado = precioAcordado;
    if (orden.snapshot.tarifa === undefined) orden.snapshot.tarifa = precioAcordado;
  }
  if (fechaProgramada !== undefined) orden.fechaProgramada = fechaProgramada;

  if (estado === 'cancelada') {
    orden.cancelacion = {
      quien: esAdmin(req) ? 'sistema' : req.auth.tipo === 'prestador' ? 'prestador' : 'cliente',
      fecha: new Date(),
      razon,
      penalizacion: penalizacion ?? calcularPenalizacion(orden),
    };
  }
  if (estado === 'calificada') await registrarCalificacion(orden, puntaje, comentario);

  const tipoActor = req.auth.tipo === 'usuario' ? 'cliente' : req.auth.tipo;
  const actor = esAdmin(req) ? { tipo: 'sistema' } : { tipo: tipoActor, id: req.auth.id };
  orden.estado = estado;
  orden.historialEstados.push({ estado, actor, nota });
  await orden.save();
  res.json(orden);
}

module.exports = { crear, listar, obtener, cambiarEstado };
