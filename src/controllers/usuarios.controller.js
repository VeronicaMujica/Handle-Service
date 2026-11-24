const Usuario = require('../models/Usuario');
const { ErrorHttp } = require('../middlewares/errores');
const { hashearPassword } = require('../utils/password');
const { esPropioOAdmin, tieneRol } = require('../middlewares/autenticacion');
const { normalizarRoles } = require('../utils/modelos');

async function prepararDatos(body, esAdmin) {
  const datos = { ...body };
  if (datos.password) {
    datos.passwordHash = await hashearPassword(datos.password);
    delete datos.password;
  } else {
    delete datos.passwordHash;
  }

  if (datos.roles !== undefined || datos.rol !== undefined) {
    datos.roles = normalizarRoles(datos.roles, datos.rol);
    delete datos.rol;
  }
  if (!esAdmin) delete datos.roles;
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
  if (req.query.zona) filtro.zona = req.query.zona;
  if (req.query.roles) filtro.roles = normalizarRoles(String(req.query.roles).split(','));
  else if (req.query.rol) filtro.roles = normalizarRoles([], req.query.rol);
  if (req.query.estado) filtro.estado = String(req.query.estado);
  else if (req.query.activa !== undefined) filtro.activa = req.query.activa === 'true';

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
  const esAdmin = tieneRol(req, 'admin');
  const datos = await prepararDatos(req.body, esAdmin);
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
