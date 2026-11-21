const { Schema, model } = require('mongoose');

const categoriaSchema = new Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    descripcion: { type: String, trim: true },
    activa: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'categorias' }
);

module.exports = model('Categoria', categoriaSchema);
