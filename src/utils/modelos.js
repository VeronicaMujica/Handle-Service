// Utilidades compartidas por los esquemas para mantener compatibilidad
// entre los nombres nuevos del modelo y los nombres usados por la interfaz.

const ROLES_CANONICOS = ['cliente', 'prestador', 'administrador'];
const ROLES_LEGACY = { usuario: 'cliente', admin: 'administrador' };

function normalizarRol(rol) {
  if (!rol) return null;
  return ROLES_LEGACY[rol] || (ROLES_CANONICOS.includes(rol) ? rol : null);
}

function normalizarRoles(roles, rolLegado) {
  const entrada = Array.isArray(roles) ? roles : rolLegado ? [rolLegado] : [];
  const resultado = [];
  for (const rol of entrada) {
    const canonico = normalizarRol(rol);
    if (canonico && !resultado.includes(canonico)) resultado.push(canonico);
  }
  return resultado;
}

// El rol principal conserva el valor que espera la interfaz ("admin", "usuario", "prestador").
function rolPrincipal(roles = []) {
  if (roles.includes('administrador')) return 'admin';
  if (roles.includes('prestador')) return 'prestador';
  return 'usuario';
}

function actualizarVigencia(certificaciones = [], ahora = new Date()) {
  for (const certificacion of certificaciones) {
    if (!certificacion) continue;
    certificacion.vigente = !certificacion.fechaVencimiento
      ? true
      : new Date(certificacion.fechaVencimiento).getTime() >= ahora.getTime();
  }
  return certificaciones;
}

// Sincroniza pares de campos (ej. { canonico: 'estado', legado: 'activo' })
// tanto en updates planos como en $set/$setOnInsert.
function sincronizarUpdate(update, pares) {
  if (!update || typeof update !== 'object') return update;
  const destinos = [update, update.$set, update.$setOnInsert].filter(Boolean);

  for (const destino of destinos) {
    for (const { canonico, legado, aCanonico, aLegado } of pares) {
      if (Object.prototype.hasOwnProperty.call(destino, canonico)) {
        destino[legado] = aLegado(destino[canonico]);
      } else if (Object.prototype.hasOwnProperty.call(destino, legado)) {
        destino[canonico] = aCanonico(destino[legado]);
      }
    }
  }
  return update;
}

module.exports = {
  ROLES_CANONICOS,
  normalizarRol,
  normalizarRoles,
  rolPrincipal,
  actualizarVigencia,
  sincronizarUpdate,
};
