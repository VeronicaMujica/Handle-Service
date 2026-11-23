const Usuario = require('../models/Usuario');
const { ErrorHttp } = require('../middlewares/errores');
const { hashearPassword } = require('../utils/password');
const { esPropioOAdmin } = require('../middlewares/autenticacion');

async function prepararDatos(body, esAdmin) {
  const datos = { ...body };
  if (datos.password) {
    datos.passwordHash = await hashearPassword(datos.password);
    delete datos.password;
  } else {
    delete datos.passwordHash;
  }
  if (!esAdmin) delete datos.rol;
  return datos;
}

async function crear(req, res) {
  const datos = await prepararDatos(req.body, true);
  const usuario = await Usuario.create(datos);
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
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes editar tu propio perfil');
  }
  const datos = await prepararDatos(req.body, req.auth.rol === 'admin');
  const usuario = await Usuario.findByIdAndUpdate(req.params.id, datos, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
  res.json(usuario);
}

async function eliminar(req, res) {
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes eliminar tu propio perfil');
  }
  const usuario = await Usuario.findByIdAndDelete(req.params.id);
  if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
  res.status(204).end();
}

module.exports = { crear, listar, obtener, actualizar, eliminar };
