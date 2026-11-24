const { Schema, model } = require('mongoose');
const { sincronizarUpdate } = require('../utils/modelos');

const aActiva = (estado) => estado !== 'inactivo';
const aEstado = (activa) => (activa === false || activa === 'false' ? 'inactivo' : 'activo');

const categoriaSchema = new Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    descripcion: { type: String, trim: true },
    // Nombre nuevo del campo. "activa" se mantiene como alias de escritura/lectura.
    estado: {
      type: String,
      enum: ['activo', 'inactivo'],
      default: 'activo',
    },
    activa: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'categorias',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

function sincronizar(documento) {
  if (documento.estado) documento.activa = aActiva(documento.estado);
  else documento.estado = aEstado(documento.activa);
}

categoriaSchema.pre('validate', function () {
  sincronizar(this);
});

categoriaSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
  sincronizarUpdate(this.getUpdate(), [
    { canonico: 'estado', legado: 'activa', aLegado: aActiva, aCanonico: aEstado },
  ]);
});

module.exports = model('Categoria', categoriaSchema);
module.exports.aEstado = aEstado;
module.exports.aActiva = aActiva;
