const jwt = require('jsonwebtoken');
const { ErrorHttp } = require('../middlewares/errores');

function secreto() {
  if (!process.env.JWT_SECRET) {
    throw new ErrorHttp(500, 'Falta JWT_SECRET en el archivo .env');
  }
  return process.env.JWT_SECRET;
}

function emitirToken(cuenta, tipo = 'usuario') {
  return jwt.sign(
    { rol: cuenta.rol, tipo },
    secreto(),
    {
      subject: String(cuenta._id || cuenta.id),
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    }
  );
}

function verificarToken(token) {
  return jwt.verify(token, secreto());
}

module.exports = { emitirToken, verificarToken };
