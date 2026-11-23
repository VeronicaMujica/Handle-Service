const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'secreto-de-pruebas';

const app = require('../src/app');
const Usuario = require('../src/models/Usuario');
const Prestador = require('../src/models/Prestador');
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
    Prestador.deleteMany({}),
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

test('registro, login y rechazo de credenciales invalidas', async () => {
  const cuenta = await registrar('usuario', 'ana@example.com');
  assert.equal(cuenta.rol, 'usuario');
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

  const admin = await Usuario.create({
    nombre: 'Admin',
    email: 'admin@example.com',
    passwordHash: await hashearPassword('clave12345'),
    rol: 'admin',
  });
  const sesionAdmin = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: 'clave12345' });
  const permitido = await request(app)
    .post('/api/categorias')
    .set(bearer(sesionAdmin.body.token))
    .send({ nombre: 'Hogar' });
  assert.equal(permitido.status, 201);
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
  assert.equal(creada.body.clienteId, ana.usuario.id);

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
