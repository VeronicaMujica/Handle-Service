const Usuario = require('../models/Usuario');
const Servicio = require('../models/Servicio');
const { ErrorHttp } = require('../middlewares/errores');
const { hashearPassword } = require('../utils/password');
const { emitirToken } = require('../config/auth');
const { esPropioOAdmin, tieneRol } = require('../middlewares/autenticacion');
const { normalizarRoles } = require('../utils/modelos');

const CAMPOS_PUBLICOS = [
  'nombre',
  'email',
  'telefono',
  'documento',
  'descripcion',
  'ciudad',
  'zonas',
  'zonasCobertura',
  'modalidades',
  'servicios',
  'serviciosOfrecidos',
  'certificaciones',
  'password',
];
const CAMPOS_PRIVILEGIADOS = ['rol', 'roles', 'estado', 'calificacionPromedio', 'totalCalificaciones', 'passwordHash'];
const CAMPOS_USUARIO = ['nombre', 'email', 'telefono', 'ciudad'];

function filtrar(body, campos) {
  return Object.fromEntries(campos.filter((c) => body[c] !== undefined).map((c) => [c, body[c]]));
}

function residenteSesion(cuenta, tipo) {
  return {
    id: String(cuenta._id),
    nombre: cuenta.nombre,
    email: cuenta.email,
    rol: cuenta.rol,
    roles: [...cuenta.roles],
    tipo,
  };
}

function idsServicios(servicios = []) {
  if (!Array.isArray(servicios)) return [];
  const ids = servicios
    .map((servicio) =>
      typeof servicio === 'object' ? servicio.servicioId || servicio._id || servicio.id : servicio
    )
    .filter(Boolean)
    .map(String);
  return [...new Set(ids)];
}

async function validarServicios(servicios) {
  const ids = idsServicios(servicios);
  if (ids.length === 0) return;
  const encontrados = await Servicio.countDocuments({ _id: { $in: ids } });
  if (encontrados !== ids.length) {
    throw new ErrorHttp(400, 'Uno o mas servicios ofrecidos no existen en el catalogo');
  }
}

function normalizarServicios(servicios = []) {
  return idsServicios(servicios).map((id, indice) => {
    const original = Array.isArray(servicios) && typeof servicios[indice] === 'object' ? servicios[indice] : {};
    const tarifa = original.tarifa ?? original.tarifaBase;
    return {
      _id: id,
      servicioId: id,
      nombre: original.nombre,
      categoria: original.categoria,
      tarifa,
      tarifaBase: tarifa,
      unidad: original.unidad,
      experienciaAnios: original.experienciaAnios,
    };
  });
}

function vistaPrestador(usuario) {
  const perfil = usuario.perfilPrestador || {};
  return {
    _id: usuario._id,
    nombre: usuario.nombre,
    email: usuario.email,
    telefono: perfil.telefono || usuario.telefono,
    documento: perfil.documento,
    descripcion: perfil.descripcion,
    ciudad: usuario.ciudad,
    zonas: perfil.zonasCobertura || [],
    zonasCobertura: perfil.zonasCobertura || [],
    modalidades: perfil.modalidades || [],
    servicios: perfil.servicios || [],
    serviciosOfrecidos: (perfil.servicios || []).map((servicio) => ({
      servicioId: servicio._id,
      tarifaBase: servicio.tarifa,
      unidad: servicio.unidad,
      experienciaAnios: servicio.experienciaAnios,
    })),
    certificaciones: perfil.certificaciones || [],
    calificacion: perfil.calificacion || { promedio: 0, total: 0 },
    calificacionPromedio: perfil.calificacion?.promedio || 0,
    totalCalificaciones: perfil.calificacion?.total || 0,
    passwordHash: usuario.passwordHash,
    rol: usuario.rol,
    roles: usuario.roles || [],
    estado: perfil.estado || 'pendiente',
    estadoUsuario: usuario.estado,
    perfilPrestador: perfil,
    createdAt: usuario.createdAt,
    updatedAt: usuario.updatedAt,
  };
}

function perfilDesde(body) {
  const perfil = {};
  if (body.documento !== undefined) perfil.documento = body.documento;
  if (body.telefono !== undefined) perfil.telefono = body.telefono;
  if (body.descripcion !== undefined) perfil.descripcion = body.descripcion;
  if (body.modalidades !== undefined) perfil.modalidades = body.modalidades;
  if (body.zonasCobertura !== undefined) perfil.zonasCobertura = body.zonasCobertura;
  else if (body.zonas !== undefined) perfil.zonasCobertura = body.zonas;

  const servicios = body.servicios || body.serviciosOfrecidos;
  if (servicios !== undefined) perfil.servicios = normalizarServicios(servicios);
  if (body.certificaciones !== undefined) perfil.certificaciones = body.certificaciones;

  if (body.estado !== undefined && ['pendiente', 'verificado', 'suspendido'].includes(body.estado)) {
    perfil.estado = body.estado;
  }
  if (body.calificacion !== undefined) {
    perfil.calificacion = body.calificacion;
  } else if (
    body.calificacionPromedio !== undefined ||
    body.totalCalificaciones !== undefined
  ) {
    perfil.calificacion = {
      promedio: body.calificacionPromedio ?? 0,
      total: body.totalCalificaciones ?? 0,
    };
  }
  return perfil;
}

function usuarioDesde(body, esAdmin) {
  const usuario = filtrar(body, CAMPOS_USUARIO);
  if (esAdmin && (body.roles !== undefined || body.rol !== undefined)) {
    usuario.roles = normalizarRoles(body.roles, body.rol);
    if (!usuario.roles.includes('prestador')) usuario.roles.push('prestador');
  }
  if (esAdmin && ['activo', 'suspendido', 'bloqueado'].includes(body.estado)) {
    usuario.estado = body.estado;
  }
  return usuario;
}

async function crear(req, res) {
  const datos = filtrar(req.body, CAMPOS_PUBLICOS);
  const perfil = perfilDesde(datos);
  await validarServicios(perfil.servicios);

  const esAdmin = tieneRol(req, 'administrador', 'admin');
  const cuenta = req.auth ? await Usuario.findById(req.auth.id) : null;
  if (req.auth && !cuenta) throw new ErrorHttp(401, 'La cuenta del token no es valida');

  const emailSolicitado = datos.email
    ? String(datos.email).trim().toLowerCase()
    : cuenta?.email;
  const aplicarACuenta = Boolean(cuenta) && (!emailSolicitado || emailSolicitado === cuenta.email);

  if (cuenta && !esAdmin && !aplicarACuenta) {
    throw new ErrorHttp(409, 'No puedes registrar un prestador con el correo de otra cuenta');
  }

  if (aplicarACuenta) {
    if (cuenta.perfilPrestador) {
      throw new ErrorHttp(409, 'Esta cuenta ya tiene un perfil de prestador');
    }

    const roles = normalizarRoles(cuenta.roles, cuenta.rol);
    if (!roles.includes('prestador')) roles.push('prestador');
    cuenta.roles = roles;

    const perfilAplicado = { ...perfil };
    if (!esAdmin) perfilAplicado.estado = 'pendiente';
    cuenta.perfilPrestador = perfilAplicado;

    if (esAdmin) {
      const datosUsuario = usuarioDesde(datos, true);
      delete datosUsuario.roles;
      Object.assign(cuenta, datosUsuario);
    } else {
      if (datos.telefono !== undefined) cuenta.telefono = datos.telefono;
      if (datos.ciudad !== undefined) cuenta.ciudad = datos.ciudad;
    }

    await cuenta.save();

    const tipo = 'prestador';
    return res.status(201).json({
      ...vistaPrestador(cuenta),
      token: emitirToken(cuenta, tipo),
      tipo,
      roles: [...cuenta.roles],
      usuario: residenteSesion(cuenta, tipo),
    });
  }

  const roles = normalizarRoles(datos.roles, datos.rol);
  if (!roles.includes('prestador')) roles.push('prestador');

  const usuario = await Usuario.create({
    ...usuarioDesde(datos, esAdmin),
    roles,
    passwordHash: datos.password ? await hashearPassword(datos.password) : datos.passwordHash,
    perfilPrestador: perfil,
  });
  res.status(201).json(vistaPrestador(usuario));
}

async function listar(req, res) {
  const { servicioId, servicio, zona, zonasCobertura, estado } = req.query;
  const filtro = { perfilPrestador: { $exists: true, $ne: null } };
  if (servicioId || servicio) {
    filtro['perfilPrestador.servicios._id'] = servicioId || servicio;
  }
  if (zona || zonasCobertura) filtro['perfilPrestador.zonasCobertura'] = zona || zonasCobertura;
  if (estado) filtro['perfilPrestador.estado'] = estado;

  const usuarios = await Usuario.find(filtro).sort({
    'perfilPrestador.calificacion.promedio': -1,
    nombre: 1,
  });
  res.json(usuarios.map(vistaPrestador));
}

async function obtener(req, res) {
  const usuario = await Usuario.findById(req.params.id);
  if (!usuario?.perfilPrestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.json(vistaPrestador(usuario));
}

async function actualizar(req, res) {
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes editar tu propio perfil');
  }
  const esAdmin = tieneRol(req, 'admin');
  const datos = filtrar(req.body, esAdmin ? [...CAMPOS_PUBLICOS, ...CAMPOS_PRIVILEGIADOS] : CAMPOS_PUBLICOS);
  const perfil = perfilDesde(datos);
  await validarServicios(perfil.servicios);

  const set = {};
  for (const [clave, valor] of Object.entries(usuarioDesde(datos, esAdmin))) set[clave] = valor;
  if (datos.password) set.passwordHash = await hashearPassword(datos.password);
  for (const [clave, valor] of Object.entries(perfil)) {
    set[`perfilPrestador.${clave}`] = valor;
  }

  const usuario = await Usuario.findByIdAndUpdate(
    req.params.id,
    { $set: set },
    { returnDocument: 'after', runValidators: true }
  );
  if (!usuario?.perfilPrestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.json(vistaPrestador(usuario));
}

async function eliminar(req, res) {
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes eliminar tu propio perfil');
  }
  const usuario = await Usuario.findById(req.params.id);
  if (!usuario?.perfilPrestador) throw new ErrorHttp(404, 'Prestador no encontrado');

  const rolesRestantes = (usuario.roles || []).filter((rol) => rol !== 'prestador');
  if (rolesRestantes.length > 0) {
    await Usuario.findByIdAndUpdate(req.params.id, {
      $set: { roles: rolesRestantes },
      $unset: { perfilPrestador: '' },
    });
  } else {
    await Usuario.findByIdAndDelete(req.params.id);
  }
  res.status(204).end();
}

async function agregarCertificacion(req, res) {
  if (!esPropioOAdmin(req, req.params.id)) {
    throw new ErrorHttp(403, 'Solo puedes agregar certificaciones a tu propio perfil');
  }
  const certificacion = {
    ...req.body,
    nombre: req.body.nombre || req.body.titulo,
    institucion: req.body.institucion || req.body.entidad,
  };
  Usuario.actualizarVigencia([certificacion]);

  const usuario = await Usuario.findByIdAndUpdate(
    req.params.id,
    { $push: { 'perfilPrestador.certificaciones': certificacion } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!usuario?.perfilPrestador) throw new ErrorHttp(404, 'Prestador no encontrado');
  res.status(201).json(vistaPrestador(usuario));
}

module.exports = {
  crear,
  listar,
  obtener,
  actualizar,
  eliminar,
  agregarCertificacion,
  validarServicios,
  vistaPrestador,
  normalizarServicios,
};
