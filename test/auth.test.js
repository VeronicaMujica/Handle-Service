const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'secreto-de-pruebas';

const app = require('../src/app');
const Usuario = require('../src/models/Usuario');
const Categoria = require('../src/models/Categoria');
const Servicio = require('../src/models/Servicio');
const Orden = require('../src/models/Orden');
const { hashearPassword } = require('../src/utils/password');

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    Usuario.deleteMany({}),
    Categoria.deleteMany({}),
    Servicio.deleteMany({}),
    Orden.deleteMany({}),
  ]);
});

async function registrar(rol, email) {
  const res = await request(app).post('/api/auth/registro').send({
    rol,
    nombre: email.split('@')[0],
    email,
    password: 'clave12345',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function crearAdministrador() {
  return Usuario.create({
    nombre: 'Admin',
    email: 'admin@example.com',
    passwordHash: await hashearPassword('clave12345'),
    roles: ['administrador'],
  });
}

test('registro, login y rechazo de credenciales invalidas', async () => {
  const cuenta = await registrar('usuario', 'ana@example.com');
  assert.equal(cuenta.rol, 'usuario');
  assert.deepEqual(cuenta.roles, ['cliente']);
  assert.ok(cuenta.token);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ana@example.com', password: 'clave12345' });
  assert.equal(login.status, 200);
  assert.equal(login.body.usuario.email, 'ana@example.com');

  const fallida = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ana@example.com', password: 'incorrecta' });
  assert.equal(fallida.status, 401);
});

test('las rutas de ordenes exigen sesion', async () => {
  const res = await request(app).get('/api/ordenes');
  assert.equal(res.status, 401);
});

test('solo un admin puede crear categorias', async () => {
  const cliente = await registrar('usuario', 'cliente@example.com');
  const sinPermiso = await request(app)
    .post('/api/categorias')
    .set(bearer(cliente.token))
    .send({ nombre: 'Hogar' });
  assert.equal(sinPermiso.status, 403);

  const admin = await crearAdministrador();
  const sesionAdmin = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: 'clave12345' });
  const permitido = await request(app)
    .post('/api/categorias')
    .set(bearer(sesionAdmin.body.token))
    .send({ nombre: 'Hogar' });
  assert.equal(permitido.status, 201);
  assert.equal(permitido.body.estado, 'activo');
  assert.equal(permitido.body.activa, true);
});

test('un usuario solo puede editar su propio perfil', async () => {
  const Ana = await registrar('usuario', 'ana@example.com');
  const Luis = await registrar('usuario', 'luis@example.com');
  const ajeno = await request(app)
    .put(`/api/usuarios/${Luis.usuario.id}`)
    .set(bearer(Ana.token))
    .send({ ciudad: 'Cali' });
  assert.equal(ajeno.status, 403);

  const propio = await request(app)
    .put(`/api/usuarios/${Ana.usuario.id}`)
    .set(bearer(Ana.token))
    .send({ ciudad: 'Cali' });
  assert.equal(propio.status, 200);
  assert.equal(propio.body.ciudad, 'Cali');
  assert.deepEqual(propio.body.roles, ['cliente']);
});

test('un cliente recien creado puede aplicar como prestador desde /api/prestadores', async () => {
  const ana = await registrar('usuario', 'ana@example.com');
  assert.deepEqual(ana.roles, ['cliente']);

  const respuesta = await request(app)
    .post('/api/prestadores')
    .set(bearer(ana.token))
    .send({
      nombre: 'Ana Gomez',
      email: 'ana@example.com',
      zonasCobertura: ['Chapinero'],
      descripcion: 'Ayudo con tareas del hogar',
    });
  assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
  assert.equal(respuesta.body._id, ana.usuario.id);
  assert.equal(respuesta.body.estado, 'pendiente');
  assert.ok(respuesta.body.token);
  assert.deepEqual([...respuesta.body.roles].sort(), ['cliente', 'prestador']);
  assert.equal(respuesta.body.usuario.id, ana.usuario.id);
  assert.equal(respuesta.body.usuario.tipo, 'prestador');
  assert.equal(await Usuario.countDocuments({}), 1);

  // El token anterior sigue vigente: los roles se leen de la base, no del JWT.
  const yoAnterior = await request(app).get('/api/auth/yo').set(bearer(ana.token));
  assert.equal(yoAnterior.status, 200);
  assert.deepEqual([...yoAnterior.body.roles].sort(), ['cliente', 'prestador']);

  const yoNuevo = await request(app).get('/api/auth/yo').set(bearer(respuesta.body.token));
  assert.equal(yoNuevo.status, 200);
  assert.equal(yoNuevo.body.id, ana.usuario.id);

  const repetida = await request(app).post('/api/prestadores').set(bearer(ana.token)).send({});
  assert.equal(repetida.status, 409);

  const otra = await registrar('usuario', 'otra@example.com');
  const ajena = await request(app)
    .post('/api/prestadores')
    .set(bearer(otra.token))
    .send({ email: 'ana@example.com' });
  assert.equal(ajena.status, 409);
});

test('el alta publica y el admin con otra cuenta siguen creando prestadores', async () => {
  const publica = await request(app).post('/api/prestadores').send({
    nombre: 'Carlos Mesa',
    email: 'carlos@example.com',
    ciudad: 'Bogota',
  });
  assert.equal(publica.status, 201, JSON.stringify(publica.body));
  assert.equal(publica.body.estado, 'pendiente');

  const admin = await crearAdministrador();
  const sesion = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: 'clave12345' });
  const creadaPorAdmin = await request(app)
    .post('/api/prestadores')
    .set(bearer(sesion.body.token))
    .send({ nombre: 'Nueva Prestadora', email: 'nueva@example.com' });
  assert.equal(creadaPorAdmin.status, 201, JSON.stringify(creadaPorAdmin.body));
  assert.notEqual(creadaPorAdmin.body._id, String(admin._id));
  assert.equal(await Usuario.countDocuments({}), 3);
});

test('un prestador publica un servicio y otro no puede editarlo', async () => {
  const marta = await registrar('prestador', 'marta@example.com');
  const joao = await registrar('prestador', 'joao@example.com');
  const categoria = await Categoria.create({ nombre: 'Hogar' });

  const creado = await request(app)
    .post('/api/servicios')
    .set(bearer(marta.token))
    .send({ nombre: 'Luces', descripcion: 'Cambio de luces', categoriaId: categoria._id });
  assert.equal(creado.status, 201);
  assert.equal(creado.body.categoria, 'Hogar');
  assert.equal(creado.body.inusual, false);
  assert.equal(creado.body.estado, 'activo');

  const ajeno = await request(app)
    .put(`/api/servicios/${creado.body._id}`)
    .set(bearer(joao.token))
    .send({ descripcion: 'Otra descripcion' });
  assert.equal(ajeno.status, 403);
});

test('las ordenes se filtran por rol y el cliente sale del token', async () => {
  const ana = await registrar('usuario', 'ana@example.com');
  const luis = await registrar('usuario', 'luis@example.com');
  const marta = await registrar('prestador', 'marta@example.com');
  const categoria = await Categoria.create({ nombre: 'Hogar' });
  const servicio = await Servicio.create({
    nombre: 'Luces', descripcion: 'Cambio de luces', categoriaId: categoria._id,
  });

  const comoPrestador = await request(app)
    .post('/api/ordenes')
    .set(bearer(marta.token))
    .send({ clienteId: ana.usuario.id, servicioId: servicio._id, descripcion: 'Luces' });
  assert.equal(comoPrestador.status, 403);

  const creada = await request(app)
    .post('/api/ordenes')
    .set(bearer(ana.token))
    .send({ clienteId: luis.usuario.id, servicioId: servicio._id, descripcion: 'Luces' });
  assert.equal(creada.status, 201);
  assert.equal(creada.body.cliente, ana.usuario.id);
  assert.equal(creada.body.snapshot.nombreServicio, 'Luces');
  assert.equal(creada.body.snapshot.categoria, 'Hogar');
  assert.ok(creada.body.snapshot.fechaSolicitud);

  const deAna = await request(app).get('/api/ordenes').set(bearer(ana.token));
  assert.equal(deAna.body.length, 1);
  const deLuis = await request(app).get('/api/ordenes').set(bearer(luis.token));
  assert.equal(deLuis.body.length, 0);
});

test('solo el prestador cotiza y solo el cliente asigna', async () => {
  const ana = await registrar('usuario', 'ana@example.com');
  const marta = await registrar('prestador', 'marta@example.com');
  const categoria = await Categoria.create({ nombre: 'Hogar' });
  const servicio = await Servicio.create({
    nombre: 'Luces', descripcion: 'Cambio de luces', categoriaId: categoria._id,
  });
  const orden = await Orden.create({
    clienteId: ana.usuario.id,
    servicioId: servicio._id,
    descripcion: 'Luces',
    estado: 'solicitada',
    historialEstados: [{ estado: 'solicitada', actor: { tipo: 'cliente', id: ana.usuario.id } }],
  });

  const cotizacion = await request(app)
    .patch(`/api/ordenes/${orden._id}/estado`)
    .set(bearer(marta.token))
    .send({ estado: 'cotizada', precioAcordado: 50000 });
  assert.equal(cotizacion.status, 200);
  assert.equal(cotizacion.body.historialEstados.at(-1).actor.tipo, 'prestador');

  const asignacion = await request(app)
    .patch(`/api/ordenes/${orden._id}/estado`)
    .set(bearer(ana.token))
    .send({ estado: 'asignada', prestadorId: marta.usuario.id });
  assert.equal(asignacion.status, 200, JSON.stringify(asignacion.body));
  assert.equal(asignacion.body.prestador, marta.usuario.id);
  assert.equal(asignacion.body.snapshot.nombrePrestador, 'marta@example.com'.split('@')[0]);
  assert.equal(asignacion.body.snapshot.tarifa, 50000);

  const otra = await Orden.create({
    clienteId: ana.usuario.id,
    servicioId: servicio._id,
    descripcion: 'Luces',
    estado: 'solicitada',
  });
  const sinPermiso = await request(app)
    .patch(`/api/ordenes/${otra._id}/estado`)
    .set(bearer(ana.token))
    .send({ estado: 'cotizada' });
  assert.equal(sinPermiso.status, 403);
});

test('RF-05: no se elimina una categoria con servicios asociados', async () => {
  const admin = await crearAdministrador();
  const sesionAdmin = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: 'clave12345' });
  const categoria = await Categoria.create({ nombre: 'Mascotas' });
  await Servicio.create({
    nombre: 'Paseo de iguanas',
    descripcion: 'Paseo y asoleo',
    categoria: categoria.nombre,
  });

  const respuesta = await request(app)
    .delete(`/api/categorias/${categoria._id}`)
    .set(bearer(sesionAdmin.body.token));
  assert.equal(respuesta.status, 409);
  assert.match(respuesta.body.error, /servicio\(s\) asociado\(s\)/);
});

test('perfilPrestador usa servicios, certificaciones y calificacion embebidos', async () => {
  const prestador = await registrar('prestador', 'marta@example.com');
  const categoria = await Categoria.create({ nombre: 'Hogar' });
  const servicio = await Servicio.create({
    nombre: 'Luces', descripcion: 'Cambio de luces', categoriaId: categoria._id,
  });

  const respuesta = await request(app)
    .put(`/api/prestadores/${prestador.usuario.id}`)
    .set(bearer(prestador.token))
    .send({
      zonasCobertura: ['Chapinero'],
      servicios: [{ _id: servicio._id, tarifa: 45000 }],
      certificaciones: [
        { nombre: 'Electricidad', institucion: 'SENA', fechaVencimiento: '2000-01-01' },
      ],
    });
  assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
  assert.equal(respuesta.body.perfilPrestador.servicios[0].nombre, 'Luces');
  assert.equal(respuesta.body.perfilPrestador.certificaciones[0].vigente, false);
  assert.equal(respuesta.body.perfilPrestador.certificaciones[0].verificada, false);
  assert.deepEqual(respuesta.body.zonas, ['Chapinero']);
});

test('RF-03 y RF-04: busqueda por etiquetas y filtro por modalidad', async () => {
  await Servicio.create({
    nombre: 'Doliente profesional',
    descripcion: 'Acompañamiento en funerales',
    categoria: 'Eventos',
    etiquetas: ['funeral', 'velorio'],
    modalidades: ['local'],
    inusual: true,
  });

  const porEtiqueta = await request(app).get('/api/servicios?q=funeral');
  assert.equal(porEtiqueta.status, 200);
  assert.equal(porEtiqueta.body.length, 1);

  const porModalidad = await request(app).get('/api/servicios?modalidad=local&inusual=true');
  assert.equal(porModalidad.body.length, 1);
  assert.equal(porModalidad.body[0].inusual, true);
  assert.equal(porModalidad.body[0].esInusual, true);
});

test('la cancelacion y la calificacion quedan embebidas en la orden', async () => {
  const ana = await registrar('usuario', 'ana@example.com');
  const joao = await registrar('prestador', 'joao@example.com');
  const categoria = await Categoria.create({ nombre: 'Hogar' });
  const servicio = await Servicio.create({
    nombre: 'Luces', descripcion: 'Cambio de luces', categoriaId: categoria._id,
  });

  const crear = async () => {
    const res = await request(app)
      .post('/api/ordenes')
      .set(bearer(ana.token))
      .send({ servicio: servicio._id, descripcionSolicitud: 'Cambiar luces' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body._id;
  };
  const cambiar = async (id, token, cuerpo) => {
    const res = await request(app)
      .patch(`/api/ordenes/${id}/estado`)
      .set(bearer(token))
      .send(cuerpo);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };

  const cancelada = await cambiar(await crear(), ana.token, {
    estado: 'cancelada', razon: 'Ya no lo necesito',
  });
  assert.equal(cancelada.cancelacion.quien, 'cliente');
  assert.equal(cancelada.cancelacion.razon, 'Ya no lo necesito');
  assert.equal(cancelada.cancelacion.penalizacion, 0);

  const idOrden = await crear();
  await cambiar(idOrden, joao.token, { estado: 'cotizada', precioAcordado: 50000 });
  await cambiar(idOrden, ana.token, { estado: 'aceptada', prestador: joao.usuario.id });
  await cambiar(idOrden, joao.token, { estado: 'agendada' });
  await cambiar(idOrden, joao.token, { estado: 'en_ejecucion' });
  await cambiar(idOrden, joao.token, { estado: 'finalizada' });
  await cambiar(idOrden, ana.token, { estado: 'pagada' });
  const calificada = await cambiar(idOrden, ana.token, {
    estado: 'calificada', puntaje: 4, comentario: 'Buen servicio',
  });
  assert.equal(calificada.calificacion.puntaje, 4);
  assert.equal(calificada.calificacion.comentario, 'Buen servicio');
  assert.ok(calificada.calificacion.fecha);

  const prestador = await Usuario.findById(joao.usuario.id);
  assert.equal(prestador.perfilPrestador.calificacion.total, 1);
  assert.equal(prestador.perfilPrestador.calificacion.promedio, 4);
});
