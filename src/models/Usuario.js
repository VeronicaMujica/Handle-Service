const { Schema, model } = require('mongoose');
const Servicio = require('./Servicio');
const {
  normalizarRoles,
  rolPrincipal,
  actualizarVigencia,
  sincronizarUpdate,
} = require('../utils/modelos');

const aActivo = (estado) => estado === 'activo' || estado === undefined;
const aEstado = (activo) => (activo === false || activo === 'false' ? 'suspendido' : 'activo');

const direccionSchema = new Schema(
  {
    etiqueta: { type: String, trim: true }, // "Casa", "Oficina"
    direccion: { type: String, required: true, trim: true },
    zona: { type: String, trim: true },
    ciudad: { type: String, trim: true },
  },
  { _id: false }
);

const certificacionSchema = new Schema(
  {
    nombre: { type: String, trim: true },
    institucion: { type: String, trim: true },
    fechaEmision: { type: Date },
    fechaVencimiento: { type: Date },
    vigente: { type: Boolean, default: true },
    // Nombres anteriores, aceptados como alias.
    titulo: { type: String, trim: true },
    entidad: { type: String, trim: true },
    verificada: { type: Boolean, default: true },
  },
  { _id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

certificacionSchema.pre('validate', function () {
  if (!this.nombre && this.titulo) this.nombre = this.titulo;
  if (!this.titulo && this.nombre) this.titulo = this.nombre;
  if (!this.institucion && this.entidad) this.institucion = this.entidad;
  if (!this.entidad && this.institucion) this.entidad = this.institucion;
  if (this.vigente === undefined) this.vigente = this.verificada !== false;
  actualizarVigencia([this]);
  this.verificada = this.vigente;
});

const servicioPrestadorSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, ref: 'Servicio', required: true },
    nombre: { type: String, trim: true },
    categoria: { type: String, trim: true },
    tarifa: { type: Number, min: 0 },
    // Formato anterior del mismo dato.
    servicioId: { type: Schema.Types.ObjectId, ref: 'Servicio' },
    tarifaBase: { type: Number, min: 0 },
    unidad: { type: String, enum: ['hora', 'servicio', 'dia'], default: 'servicio' },
    experienciaAnios: { type: Number, min: 0, default: 0 },
  },
  { _id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

servicioPrestadorSchema.pre('validate', async function () {
  if (!this._id && this.servicioId) this._id = this.servicioId;
  if (!this.servicioId && this._id) this.servicioId = this._id;
  if (this.tarifa === undefined && this.tarifaBase !== undefined) this.tarifa = this.tarifaBase;
  if (this.tarifaBase === undefined && this.tarifa !== undefined) this.tarifaBase = this.tarifa;

  if (this._id && (!this.nombre || !this.categoria)) {
    const servicio = await Servicio.findById(this._id);
    if (servicio) {
      this.nombre = this.nombre || servicio.nombre;
      this.categoria = this.categoria || servicio.categoria;
    }
  }
});

const perfilPrestadorSchema = new Schema(
  {
    documento: { type: String, trim: true },
    zonasCobertura: { type: [String], default: [] },
    modalidades: {
      type: [String],
      enum: ['domicilio', 'remoto', 'local'],
      default: [],
    },
    servicios: { type: [servicioPrestadorSchema], default: [] },
    certificaciones: { type: [certificacionSchema], default: [] },
    calificacion: {
      promedio: { type: Number, min: 0, max: 5, default: 0 },
      total: { type: Number, min: 0, default: 0 },
    },
    // Campos de presentación que ya usaba la interfaz.
    telefono: { type: String, trim: true },
    descripcion: { type: String, trim: true },
    estado: {
      type: String,
      enum: ['pendiente', 'verificado', 'suspendido'],
      default: 'pendiente',
    },
  },
  { _id: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

perfilPrestadorSchema.virtual('zonas').get(function () {
  return this.zonasCobertura || [];
});
perfilPrestadorSchema.virtual('zonas').set(function (valor) {
  this.zonasCobertura = valor || [];
});

perfilPrestadorSchema.virtual('serviciosOfrecidos').get(function () {
  return (this.servicios || []).map((servicio) => ({
    servicioId: servicio._id,
    tarifaBase: servicio.tarifa,
    unidad: servicio.unidad,
    experienciaAnios: servicio.experienciaAnios,
  }));
});
perfilPrestadorSchema.virtual('serviciosOfrecidos').set(function (valor) {
  if (!Array.isArray(valor)) return;
  this.servicios = valor.map((servicio) => ({
    _id: servoId(servicio),
    nombre: servicio.nombre,
    categoria: servicio.categoria,
    tarifa: servicio.tarifa ?? servicio.tarifaBase,
    servicioId: servoId(servicio),
    tarifaBase: servicio.tarifaBase ?? servicio.tarifa,
    unidad: servicio.unidad,
    experienciaAnios: servicio.experienciaAnios,
  }));
});

function servoId(servicio) {
  return servicio._id || servicio.servicioId;
}

perfilPrestadorSchema.virtual('calificacionPromedio').get(function () {
  return this.calificacion?.promedio || 0;
});
perfilPrestadorSchema.virtual('calificacionPromedio').set(function (valor) {
  this.calificacion = {
    promedio: valor || 0,
    total: this.calificacion?.total || 0,
  };
});

perfilPrestadorSchema.virtual('totalCalificaciones').get(function () {
  return this.calificacion?.total || 0;
});
perfilPrestadorSchema.virtual('totalCalificaciones').set(function (valor) {
  this.calificacion = {
    promedio: this.calificacion?.promedio || 0,
    total: valor || 0,
  };
});

const usuarioSchema = new Schema(
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
    passwordHash: { type: String, select: false },

    roles: {
      type: [{ type: String, enum: ['cliente', 'prestador', 'administrador'] }],
      default: ['cliente'],
      set: normalizarRoles,
    },
    rol: { type: String, enum: ['usuario', 'prestador', 'admin'], default: 'usuario' },

    estado: { type: String, enum: ['activo', 'suspendido', 'bloqueado'], default: 'activo' },
    activo: { type: Boolean, default: true },

    direcciones: { type: [direccionSchema], default: [] },
    telefono: { type: String, trim: true },
    ciudad: { type: String, trim: true },
    zona: { type: String, trim: true },
    caracterizacion: { type: Schema.Types.Mixed, default: {} },
    idiomas: { type: [String], default: [] },
    habilidades: { type: [String], default: [] },
    perfilPrestador: { type: perfilPrestadorSchema, default: undefined },
  },
  {
    timestamps: true,
    collection: 'usuarios',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

usuarioSchema.pre('validate', function () {
  if (!this.roles || this.roles.length === 0) this.roles = normalizarRoles([], this.rol);
  this.rol = rolPrincipal(this.roles);

  if (this.estado) this.activo = aActivo(this.estado);
  else this.estado = aEstado(this.activo);

  if (this.roles.includes('prestador')) {
    if (!this.perfilPrestador) this.perfilPrestador = {};
    actualizarVigencia(this.perfilPrestador.certificaciones);
  } else {
    this.perfilPrestador = undefined;
  }
});

usuarioSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
  const update = sincronizarUpdate(this.getUpdate(), [
    { canonico: 'estado', legado: 'activo', aLegado: aActivo, aCanonico: aEstado },
  ]);
  for (const destino of [update, update.$set, update.$setOnInsert].filter(Boolean)) {
    if (destino.roles) {
      destino.roles = normalizarRoles(destino.roles);
      destino.rol = rolPrincipal(destino.roles);
    } else if (destino.rol) {
      destino.roles = normalizarRoles([], destino.rol);
    }
    for (const clave of Object.keys(destino)) {
      if (clave.endsWith('certificaciones') && Array.isArray(destino[clave])) {
        actualizarVigencia(destino[clave]);
      }
    }
  }
});

// RF-32: una certificación vencida deja de estar vigente aunque no haya habido
// escrituras desde la fecha de vencimiento.
function recalcularVigencia(resultado) {
  const documentos = Array.isArray(resultado) ? resultado : [resultado];
  for (const documento of documentos) {
    if (documento?.perfilPrestador?.certificaciones) {
      actualizarVigencia(documento.perfilPrestador.certificaciones);
    }
  }
}
usuarioSchema.post(['find', 'findOne', 'findOneAndUpdate'], function (resultado) {
  recalcularVigencia(resultado);
});

usuarioSchema.index({ roles: 1 });
usuarioSchema.index({ 'perfilPrestador.servicios._id': 1 });
usuarioSchema.index({ 'perfilPrestador.zonasCobertura': 1 });

const Usuario = model('Usuario', usuarioSchema);

module.exports = Usuario;
module.exports.normalizarRoles = normalizarRoles;
module.exports.rolPrincipal = rolPrincipal;
module.exports.actualizarVigencia = actualizarVigencia;
module.exports.aEstado = aEstado;
module.exports.aActivo = aActivo;
