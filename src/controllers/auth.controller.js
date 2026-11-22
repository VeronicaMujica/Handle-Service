const Usuario = require('../models/Usuario');
const Prestador = require('../models/Prestador');
const { ErrorHttp } = require('../middlewares/errores');
const { hashearPassword, verificarPassword } = require('../utils/password');
const { emitirToken } = require('../config/auth');
const { validarServicios } = require('./prestadores.controller');

const CAMPOS_USUARIO = ['telefono', 'ciudad', 'direcciones'];
const CAMPOS_PRESTADOR = [
  'telefono',
  'documento',
  'descripcion',
  'ciudad',
  'zonas',
  'serviciosOfrecidos',
];

function residente(cuenta, tipo) {
  return {
    id: String(cuenta._id),
    nombre: cuenta.nombre,
    email: cuenta.email,
    rol: cuenta.rol,
    tipo,
  };
}

async function registrar(req, res) {
  const { rol, nombre, email, password, ...resto } = req.body || {};
  if (!['usuario', 'prestador'].includes(rol)) {
    throw new ErrorHttp(400, 'El rol debe ser "usuario" o "prestador"');
  }
  if (!nombre || !email || !password) {
    throw new ErrorHttp(400, 'Nombre, email y password son obligatorios');
  }
  if (String(password).length < 8) {
    throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');
  }

  const correo = String(email).trim().toLowerCase();
  const [porUsuario, porPrestador] = await Promise.all([
    Usuario.exists({ email: correo }),
    Prestador.exists({ email: correo }),
  ]);
  if (porUsuario || porPrestador) {
    throw new ErrorHttp(409, 'Ya existe una cuenta con ese email');
  }

  const permitidos = rol === 'prestador' ? CAMPOS_PRESTADOR : CAMPOS_USUARIO;
  const datos = { nombre, email: correo, passwordHash: await hashearPassword(password) };
  for (const campo of permitidos) {
    if (resto[campo] !== undefined) datos[campo] = resto[campo];
  }
  if (rol === 'prestador') await validarServicios(datos.serviciosOfrecidos);

  const cuenta = rol === 'prestador' ? await Prestador.create(datos) : await Usuario.create(datos);
  res.status(201).json({
    token: emitirToken(cuenta, rol),
    rol: cuenta.rol,
    tipo: rol,
    usuario: residente(cuenta, rol),
  });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw new ErrorHttp(400, 'Email y password son obligatorios');
  }

  const correo = String(email).trim().toLowerCase();
  const usuario = await Usuario.findOne({ email: correo }).select('+passwordHash');
  const cuenta = usuario || (await Prestador.findOne({ email: correo }).select('+passwordHash'));
  if (!cuenta || !(await verificarPassword(password, cuenta.passwordHash))) {
    throw new ErrorHttp(401, 'Credenciales invalidas');
  }
  if (cuenta.activo === false || cuenta.estado === 'suspendido') {
    throw new ErrorHttp(403, 'La cuenta esta inactiva');
  }

  const tipo = usuario ? 'usuario' : 'prestador';
  res.json({
    token: emitirToken(cuenta, tipo),
    rol: cuenta.rol,
    tipo,
    usuario: residente(cuenta, tipo),
  });
}

async function yo(req, res) {
  res.json(req.auth);
}

module.exports = { registrar, login, yo };
