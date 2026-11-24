const { Schema, model } = require('mongoose');
const Usuario = require('./Usuario');
const Servicio = require('./Servicio');
const { sincronizarUpdate } = require('../utils/modelos');

// Se conserva el flujo completo de cotización/agenda/pago y se añade "aceptada"
// como estado del formato nuevo (equivalente a la aceptación de la cotización).
const ESTADOS = [
  'solicitada',
  'cotizada',
  'asignada',
  'aceptada',
  'agendada',
  'en_ejecucion',
  'finalizada',
  'pagada',
  'calificada',
  'cancelada',
  'en_reclamo',
];

const TRANSICIONES = {
  solicitada: ['cotizada', 'asignada', 'aceptada', 'cancelada'],
  cotizada: ['asignada', 'aceptada', 'cancelada'],
  asignada: ['agendada', 'cancelada'],
  aceptada: ['agendada', 'cancelada'],
  agendada: ['en_ejecucion', 'cancelada'],
  en_ejecucion: ['finalizada', 'en_reclamo'],
  finalizada: ['pagada', 'en_reclamo'],
  pagada: ['calificada', 'en_reclamo'],
  calificada: [],
  cancelada: [],
  en_reclamo: ['finalizada', 'cancelada'],
};

const ESTADOS_ASIGNACION = ['asignada', 'aceptada'];

const paresReferencias = [
  { canonico: 'cliente', legado: 'clienteId', aLegado: (v) => v, aCanonico: (v) => v },
  { canonico: 'servicio', legado: 'servicioId', aLegado: (v) => v, aCanonico: (v) => v },
  { canonico: 'prestador', legado: 'prestadorId', aLegado: (v) => v || null, aCanonico: (v) => v || null },
];

function sincronizarReferencias(documento) {
  for (const { canonico, legado, aLegado, aCanonico } of paresReferencias) {
    if (documento[canonico] !== undefined) documento[legado] = aLegado(documento[canonico]);
    else if (documento[legado] !== undefined) documento[canonico] = aCanonico(documento[legado]);
  }
}

const cambioEstadoSchema = new Schema(
  {
    estado: { type: String, enum: ESTADOS, required: true },
    fecha: { type: Date, default: Date.now },
    actor: {
      tipo: { type: String, enum: ['cliente', 'prestador', 'sistema'], required: true },
      id: { type: Schema.Types.ObjectId },
    },
    nota: { type: String, trim: true },
  },
  { _id: false }
);

const snapshotSchema = new Schema(
  {
    nombreCliente: { type: String, trim: true },
    nombrePrestador: { type: String, trim: true },
    nombreServicio: { type: String, trim: true },
    categoria: { type: String, trim: true },
    modalidad: { type: String, enum: ['domicilio', 'remoto', 'local'] },
    zona: { type: String, trim: true },
    tarifa: { type: Number, min: 0 },
    inusual: { type: Boolean, default: false },
    descripcionSolicitud: { type: String, trim: true },
    fechaSolicitud: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cancelacionSchema = new Schema(
  {
    quien: { type: String, trim: true },
    fecha: { type: Date, default: Date.now },
    razon: { type: String, trim: true },
    penalizacion: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const calificacionOrdenSchema = new Schema(
  {
    puntaje: { type: Number, min: 1, max: 5 },
    comentario: { type: String, trim: true },
    fecha: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ordenSchema = new Schema(
  {
    cliente: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    servicio: { type: Schema.Types.ObjectId, ref: 'Servicio' },
    prestador: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    estado: { type: String, enum: ESTADOS, default: 'solicitada' },
    snapshot: { type: snapshotSchema, default: () => ({}) },
    cancelacion: { type: cancelacionSchema, default: undefined },
    calificacion: { type: calificacionOrdenSchema, default: undefined },

    // Campos heredados que siguen alimentando a la interfaz actual.
    clienteId: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    servicioId: { type: Schema.Types.ObjectId, ref: 'Servicio' },
    prestadorId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    descripcion: { type: String, required: true, trim: true },
    modalidad: { type: String, enum: ['domicilio', 'remoto', 'local'], default: 'domicilio' },
    zona: { type: String, trim: true },
    direccion: { type: String, trim: true },
    fechaProgramada: { type: Date },
    precioAcordado: { type: Number, min: 0 },
    historialEstados: { type: [cambioEstadoSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'ordenes',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

async function completarSnapshot(orden) {
  const instantanea = orden.snapshot || {};
  const idCliente = orden.cliente || orden.clienteId;
  const idServicio = orden.servicio || orden.servicioId;
  const idPrestador = orden.prestador || orden.prestadorId;

  if (!instantanea.nombreCliente || !instantanea.nombreServicio || !instantanea.categoria) {
    const [cliente, servicio] = await Promise.all([
      idCliente ? Usuario.findById(idCliente).select('nombre') : null,
      idServicio ? Servicio.findById(idServicio).select('nombre categoria inusual esInusual') : null,
    ]);
    instantanea.nombreCliente = instantanea.nombreCliente || cliente?.nombre;
    instantanea.nombreServicio = instantanea.nombreServicio || servicio?.nombre;
    instantanea.categoria = instantanea.categoria || servicio?.categoria;
    if (instantanea.inusual === undefined) {
      instantanea.inusual = servicio?.inusual ?? servicio?.esInusual ?? false;
    }
  }

  if (idPrestador && (!instantanea.nombrePrestador || instantanea.tarifa === undefined)) {
    const prestador = await Usuario.findById(idPrestador).select('nombre perfilPrestador');
    instantanea.nombrePrestador = instantanea.nombrePrestador || prestador?.nombre;
    const oferta = prestador?.perfilPrestador?.servicios.find(
      (s) => String(s._id) === String(idServicio)
    );
    if (instantanea.tarifa === undefined) {
      instantanea.tarifa = oferta?.tarifa ?? oferta?.tarifaBase ?? orden.precioAcordado;
    }
  }

  instantanea.modalidad = instantanea.modalidad || orden.modalidad;
  instantanea.zona = instantanea.zona || orden.zona;
  instantanea.descripcionSolicitud = instantanea.descripcionSolicitud || orden.descripcion;
  instantanea.fechaSolicitud = instantanea.fechaSolicitud || orden.createdAt || new Date();
  orden.snapshot = instantanea;
}

ordenSchema.pre('validate', async function () {
  sincronizarReferencias(this);
  if (!this.descripcion && this.snapshot?.descripcionSolicitud) {
    this.descripcion = this.snapshot.descripcionSolicitud;
  }
  await completarSnapshot(this);
});

ordenSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
  const update = sincronizarUpdate(this.getUpdate(), paresReferencias);
  for (const destino of [update, update.$set, update.$setOnInsert].filter(Boolean)) {
    if (destino.snapshot && !destino.descripcion && destino.snapshot.descripcionSolicitud) {
      destino.descripcion = destino.snapshot.descripcionSolicitud;
    }
  }
});

ordenSchema.index({ cliente: 1, createdAt: -1 });
ordenSchema.index({ clienteId: 1, createdAt: -1 });
ordenSchema.index({ prestador: 1, estado: 1 });
ordenSchema.index({ prestadorId: 1, estado: 1 });
ordenSchema.index({ estado: 1 });

const Orden = model('Orden', ordenSchema);

module.exports = Orden;
module.exports.ESTADOS = ESTADOS;
module.exports.TRANSICIONES = TRANSICIONES;
module.exports.ESTADOS_ASIGNACION = ESTADOS_ASIGNACION;
