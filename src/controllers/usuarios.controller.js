const Usuario = require('../models/Usuario');
const { ErrorHttp } = require('../middlewares/errores');

async function crear(req, res) {
  const usuario = await Usuario.create(req.body);
  res.status(201).json(usuario);
}

async function listar(req, res) {
  const filtro = {};
  if (req.query.ciudad) filtro.ciudad = req.query.ciudad;
  const usuarios = await Usuario.find(filtro).sort({ nombre: 1 });
  res.json(usuarios);
}

async function obtener(req, res) {
  const usuario = await Usuario.findById(req.params.id);
  if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
  res.json(usuario);
}

async function actualizar(req, res) {
  const usuario = await Usuario.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
  res.json(usuario);
}

async function eliminar(req, res) {
  const usuario = await Usuario.findByIdAndDelete(req.params.id);
  if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
  res.status(204).end();
}

module.exports = { crear, listar, obtener, actualizar, eliminar };
