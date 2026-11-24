const { Schema, model } = require('mongoose');
const Categoria = require('./Categoria');
const { sincronizarUpdate } = require('../utils/modelos');

const aActivo = (estado) => estado !== 'retirado';
const aEstado = (activo) => (activo === false || activo === 'false' ? 'retirado' : 'activo');

const pares = [
  { canonico: 'inusual', legado: 'esInusual', aLegado: (v) => v === true, aCanonico: (v) => v === true },
  { canonico: 'estado', legado: 'activo', aLegado: aActivo, aCanonico: aEstado },
];

function sincronizar(documento) {
  if (documento.inusual !== undefined) documento.esInusual = documento.inusual === true;
  else documento.inusual = documento.esInusual === true;

  if (documento.estado) documento.activo = aActivo(documento.estado);
  else documento.estado = aEstado(documento.activo);
}

async function resolverCategoriaDe(destino) {
  if (!destino) return;
  if (destino.categoriaId && !destino.categoria) {
    const categoria = await Categoria.findById(destino.categoriaId);
    if (categoria) destino.categoria = categoria.nombre;
  } else if (destino.categoria && !destino.categoriaId) {
    const categoria = await Categoria.findOne({ nombre: destino.categoria }).collation({
      locale: 'es',
      strength: 1,
    });
    if (categoria) destino.categoriaId = categoria._id;
  }
}

const servicioSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },
    categoria: { type: String, trim: true },
    etiquetas: { type: [String], default: [] },
    modalidades: {
      type: [String],
      enum: ['domicilio', 'remoto', 'local'],
      default: ['domicilio'],
    },
    inusual: { type: Boolean, default: false },
    estado: { type: String, enum: ['activo', 'retirado'], default: 'activo' },

    // Campos heredados, conservados para que la interfaz y los clientes actuales sigan funcionando.
    imagen: { type: String, trim: true },
    categoriaId: { type: Schema.Types.ObjectId, ref: 'Categoria' },
    esInusual: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  },
  {
    timestamps: true,
    collection: 'servicios',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

servicioSchema.pre('validate', async function () {
  sincronizar(this);
  await resolverCategoriaDe(this);
});

servicioSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], async function () {
  const update = sincronizarUpdate(this.getUpdate(), pares);
  const destinos = [update, update.$set, update.$setOnInsert].filter(Boolean);
  for (const destino of destinos) await resolverCategoriaDe(destino);
});

servicioSchema.index(
  { nombre: 'text', descripcion: 'text', etiquetas: 'text', categoria: 'text' },
  { default_language: 'spanish', name: 'busqueda_servicios' }
);
servicioSchema.index({ categoria: 1 });
servicioSchema.index({ categoriaId: 1 });

module.exports = model('Servicio', servicioSchema);
module.exports.aEstado = aEstado;
module.exports.aActivo = aActivo;
