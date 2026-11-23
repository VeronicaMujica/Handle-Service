const { Schema, model } = require('mongoose');

const servicioOfrecidoSchema = new Schema(
  {
    servicioId: { type: Schema.Types.ObjectId, ref: 'Servicio', required: true },
    tarifaBase: { type: Number, required: true, min: 0 },
    unidad: { type: String, enum: ['hora', 'servicio', 'dia'], default: 'servicio' },
    experienciaAnios: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const certificacionSchema = new Schema({
  titulo: { type: String, required: true, trim: true },
  entidad: { type: String, trim: true },
  fechaEmision: { type: Date },
  fechaVencimiento: { type: Date },
  verificada: { type: Boolean, default: false },
});

const prestadorSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'El email no es valido'],
    },
    telefono: { type: String, trim: true },
    documento: { type: String, trim: true },
    descripcion: { type: String, trim: true },
    ciudad: { type: String, trim: true },
    zonas: { type: [String], default: [] },
    serviciosOfrecidos: { type: [servicioOfrecidoSchema], default: [] },
    certificaciones: { type: [certificacionSchema], default: [] },
    passwordHash: { type: String, select: false },
    rol: { type: String, enum: ['prestador'], default: 'prestador' },
    calificacionPromedio: { type: Number, min: 0, max: 5, default: 0 },
    totalCalificaciones: { type: Number, min: 0, default: 0 },
    estado: {
      type: String,
      enum: ['pendiente', 'verificado', 'suspendido'],
      default: 'pendiente',
    },
  },
  { timestamps: true, collection: 'prestadores' }
);

// MongoDB no admite un indice compuesto sobre dos arreglos; por eso van separados
prestadorSchema.index({ 'serviciosOfrecidos.servicioId': 1 });
prestadorSchema.index({ zonas: 1 });

module.exports = model('Prestador', prestadorSchema);
