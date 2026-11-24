const Usuario = require('../models/Usuario');
const { ErrorHttp } = require('./errores');
const { verificarToken } = require('../config/auth');
const { normalizarRol } = require('../utils/modelos');

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

    const cuenta = await Usuario.findById(payload.sub);
    if (!cuenta) throw new ErrorHttp(401, 'La cuenta del token no es valida');

    const rolToken = normalizarRol(payload.rol);
    if (!cuenta.roles.includes(rolToken)) {
      throw new ErrorHttp(401, 'La cuenta del token no es valida');
    }
    if (['suspendido', 'bloqueado'].includes(cuenta.estado) || cuenta.activo === false) {
      throw new ErrorHttp(403, 'La cuenta esta inactiva');
    }

    req.auth = {
      id: String(cuenta._id),
      tipo: payload.tipo,
      rol: cuenta.rol,
      roles: [...cuenta.roles],
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

// Permite rutas públicas que cambian de comportamiento cuando viene un token.
// Si el header está ausente no exige sesión; si viene, se valida normalmente.
function autenticarOpcional(req, res, next) {
  if (!String(req.headers.authorization || '').trim()) return next();
  return autenticar(req, res, next);
}

function tieneRol(req, ...roles) {
  if (!req.auth) return false;
  return roles.some((rol) => {
    const canonico = normalizarRol(rol);
    return req.auth.roles?.includes(canonico) || req.auth.rol === rol;
  });
}

function autorizar(...roles) {
  return (req, res, next) => {
    if (!req.auth) return next(new ErrorHttp(401, 'Se requiere inicio de sesion'));
    if (!tieneRol(req, ...roles)) {
      return next(new ErrorHttp(403, 'No tiene permisos para esta operacion'));
    }
    next();
  };
}

function esPropioOAdmin(req, id) {
  return Boolean(req.auth && (tieneRol(req, 'admin') || req.auth.id === String(id)));
}

module.exports = { autenticar, autenticarOpcional, autorizar, tieneRol, esPropioOAdmin };
