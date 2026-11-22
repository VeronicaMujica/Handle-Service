const { Schema, model } = require('mongoose');

const servicioSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },
    imagen: { type: String, trim: true },
    categoriaId: { type: Schema.Types.ObjectId, ref: 'Categoria', required: true },
    etiquetas: { type: [String], default: [] },
    modalidades: {
      type: [String],
      enum: ['domicilio', 'remoto', 'local'],
      default: ['domicilio'],
    },
    esInusual: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'servicios' }
);

servicioSchema.index(
  { nombre: 'text', descripcion: 'text', etiquetas: 'text' },
  { default_language: 'spanish', name: 'busqueda_servicios' }
);
servicioSchema.index({ categoriaId: 1 });

module.exports = model('Servicio', servicioSchema);
