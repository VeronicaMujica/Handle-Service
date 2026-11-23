const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

async function hashearPassword(password) {
  const sal = crypto.randomBytes(16);
  const derivada = await scrypt(String(password), sal, 64);
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

async function verificarPassword(password, guardado) {
  if (typeof guardado !== 'string') return false;
  const [algoritmo, salHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  if (!esperado.length) return false;
  const derivada = await scrypt(String(password), Buffer.from(salHex, 'hex'), esperado.length);
  return esperado.length === derivada.length && crypto.timingSafeEqual(esperado, derivada);
}

module.exports = { hashearPassword, verificarPassword };
