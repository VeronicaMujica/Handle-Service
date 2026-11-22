const Usuario = require('../models/Usuario');
const Prestador = require('../models/Prestador');
const { ErrorHttp } = require('./errores');
const { verificarToken } = require('../config/auth');

async function autenticar(req, res, next) {
  try {
    const [esquema, token] = String(req.headers.authorization || '').split(' ');
    if (esquema?.toLowerCase() !== 'bearer' || !token) {
      throw new ErrorHttp(401, 'Se requiere inicio de sesion (token Bearer)');
    }

    const payload = verificarToken(token);
    if (!payload.sub || !payload.tipo || !payload.rol) {
      throw new ErrorHttp(401, 'Token invalido');
    }

    const modelo = payload.tipo === 'prestador' ? Prestador : Usuario;
    const cuenta = await modelo.findById(payload.sub);
    if (!cuenta || cuenta.rol !== payload.rol) {
      throw new ErrorHttp(401, 'La cuenta del token no es valida');
    }
    if (cuenta.activo === false || cuenta.estado === 'suspendido') {
      throw new ErrorHttp(403, 'La cuenta esta inactiva');
    }

    req.auth = {
      id: String(cuenta._id),
      tipo: payload.tipo,
      rol: cuenta.rol,
      nombre: cuenta.nombre,
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new ErrorHttp(401, 'Token invalido o expirado'));
    }
    next(error);
  }
}

function autorizar(...roles) {
  return (req, res, next) => {
    if (!req.auth) return next(new ErrorHttp(401, 'Se requiere inicio de sesion'));
    if (!roles.includes(req.auth.rol)) {
      return next(new ErrorHttp(403, 'No tiene permisos para esta operacion'));
    }
    next();
  };
}

function esPropioOAdmin(req, id) {
  return Boolean(req.auth && (req.auth.rol === 'admin' || req.auth.id === String(id)));
}

module.exports = { autenticar, autorizar, esPropioOAdmin };
