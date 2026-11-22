const { Schema, model } = require('mongoose');

const direccionSchema = new Schema(
  {
    etiqueta: { type: String, required: true, trim: true }, // "Casa", "Oficina"
    direccion: { type: String, required: true, trim: true },
    zona: { type: String, required: true, trim: true },
  },
  { _id: false }
);

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
    telefono: { type: String, trim: true },
    ciudad: { type: String, trim: true },
    direcciones: { type: [direccionSchema], default: [] },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'usuarios' }
);

module.exports = model('Usuario', usuarioSchema);
