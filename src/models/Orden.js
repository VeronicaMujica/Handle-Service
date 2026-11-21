const { Schema, model } = require('mongoose');

const ESTADOS = [
  'solicitada',
  'cotizada',
  'asignada',
  'agendada',
  'en_ejecucion',
  'finalizada',
  'pagada',
  'calificada',
  'cancelada',
  'en_reclamo',
];

const TRANSICIONES = {
  solicitada: ['cotizada', 'cancelada'],
  cotizada: ['asignada', 'cancelada'],
  asignada: ['agendada', 'cancelada'],
  agendada: ['en_ejecucion', 'cancelada'],
  en_ejecucion: ['finalizada', 'en_reclamo'],
  finalizada: ['pagada', 'en_reclamo'],
  pagada: ['calificada', 'en_reclamo'],
  calificada: [],
  cancelada: [],
  en_reclamo: ['finalizada', 'cancelada'],
};

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

const ordenSchema = new Schema(
  {
    clienteId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    servicioId: { type: Schema.Types.ObjectId, ref: 'Servicio', required: true },
    prestadorId: { type: Schema.Types.ObjectId, ref: 'Prestador', default: null },
    descripcion: { type: String, required: true, trim: true },
    modalidad: { type: String, enum: ['domicilio', 'remoto', 'local'], default: 'domicilio' },
    zona: { type: String, trim: true },
    direccion: { type: String, trim: true },
    fechaProgramada: { type: Date },
    precioAcordado: { type: Number, min: 0 },
    estado: { type: String, enum: ESTADOS, default: 'solicitada' },
    historialEstados: { type: [cambioEstadoSchema], default: [] },
  },
  { timestamps: true, collection: 'ordenes' }
);

ordenSchema.index({ clienteId: 1, createdAt: -1 });
ordenSchema.index({ prestadorId: 1, estado: 1 });

const Orden = model('Orden', ordenSchema);

module.exports = Orden;
module.exports.ESTADOS = ESTADOS;
module.exports.TRANSICIONES = TRANSICIONES;
