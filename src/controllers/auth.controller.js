const Usuario = require('../models/Usuario');
const { ErrorHttp } = require('../middlewares/errores');
const { hashearPassword, verificarPassword } = require('../utils/password');
const { emitirToken } = require('../config/auth');
const { validarServicios } = require('./prestadores.controller');
const { normalizarRoles, rolPrincipal } = require('../utils/modelos');

const CAMPOS_USUARIO = ['telefono', 'ciudad', 'zona', 'direcciones', 'idiomas', 'habilidades', 'caracterizacion'];
const CAMPOS_PRESTADOR = [
  'documento',
  'zonasCobertura',
  'zonas',
  'modalidades',
  'servicios',
  'serviciosOfrecidos',
  'certificaciones',
  'telefono',
  'descripcion',
];

function residente(cuenta, tipo) {
  return {
    id: String(cuenta._id),
    nombre: cuenta.nombre,
    email: cuenta.email,
    rol: cuenta.rol,
    roles: [...cuenta.roles],
    tipo,
  };
}

function tipoDeSesion(roles, preferido) {
  if (preferido) return preferido;
  if (roles.includes('administrador')) return 'usuario';
  return roles.includes('prestador') ? 'prestador' : 'usuario';
}

async function registrar(req, res) {
  const { rol, roles, nombre, email, password, ...resto } = req.body || {};
  const rolesSolicitados = normalizarRoles(roles, rol);
  if (rolesSolicitados.length !== 1 || !['cliente', 'prestador'].includes(rolesSolicitados[0])) {
    throw new ErrorHttp(400, 'El rol debe ser "usuario" o "prestador"');
  }
  const esPrestador = rolesSolicitados[0] === 'prestador';
  if (!nombre || !email || !password) {
    throw new ErrorHttp(400, 'Nombre, email y password son obligatorios');
  }
  if (String(password).length < 8) {
    throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');
  }

  const correo = String(email).trim().toLowerCase();
  if (await Usuario.exists({ email: correo })) {
    throw new ErrorHttp(409, 'Ya existe una cuenta con ese email');
  }

  const datos = {
    nombre,
    email: correo,
    passwordHash: await hashearPassword(password),
    roles: rolesSolicitados,
  };
  const permitidos = esPrestador ? [...CAMPOS_USUARIO, ...CAMPOS_PRESTADOR] : CAMPOS_USUARIO;
  const restoPerfil = {};
  for (const campo of permitidos) {
    if (resto[campo] === undefined) continue;
    if (CAMPOS_PRESTADOR.includes(campo)) restoPerfil[campo] = resto[campo];
    else datos[campo] = resto[campo];
  }
  if (esPrestador) {
    await validarServicios(restoPerfil.servicios || restoPerfil.serviciosOfrecidos);
    datos.perfilPrestador = restoPerfil;
  }

  const cuenta = await Usuario.create(datos);
  const tipo = tipoDeSesion(cuenta.roles, esPrestador ? 'prestador' : 'usuario');
  res.status(201).json({
    token: emitirToken(cuenta, tipo),
    rol: cuenta.rol,
    roles: [...cuenta.roles],
    tipo,
    usuario: residente(cuenta, tipo),
  });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw new ErrorHttp(400, 'Email y password son obligatorios');
  }

  const correo = String(email).trim().toLowerCase();
  const cuenta = await Usuario.findOne({ email: correo }).select('+passwordHash');
  if (!cuenta || !(await verificarPassword(password, cuenta.passwordHash))) {
    throw new ErrorHttp(401, 'Credenciales invalidas');
  }
  if (['suspendido', 'bloqueado'].includes(cuenta.estado) || cuenta.activo === false) {
    throw new ErrorHttp(403, 'La cuenta esta inactiva');
  }

  const tipo = tipoDeSesion(cuenta.roles);
  res.json({
    token: emitirToken(cuenta, tipo),
    rol: cuenta.rol,
    roles: [...cuenta.roles],
    tipo,
    usuario: residente(cuenta, tipo),
  });
}

async function yo(req, res) {
  res.json(req.auth);
}

module.exports = { registrar, login, yo, tipoDeSesion, rolPrincipal };
