const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'secreto-de-pruebas';

const app = require('../src/app');
const Usuario = require('../src/models/Usuario');
const Orden = require('../src/models/Orden');
const { hashearPassword } = require('../src/utils/password');

let mongo;
let tokenAdmin;
let tokenCliente;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Usuario.deleteMany({}), Orden.deleteMany({})]);

  const admin = await Usuario.create({
    nombre: 'Admin',
    email: 'admin@example.com',
    roles: ['administrador'],
    passwordHash: await hashearPassword('clave12345'),
  });
  const cliente = await Usuario.create({
    nombre: 'Ana',
    email: 'ana@example.com',
    passwordHash: await hashearPassword('clave12345'),
  });

  const [joao, marta] = await Usuario.create([
    {
      nombre: 'Joao',
      email: 'joao@example.com',
      roles: ['prestador'],
      perfilPrestador: {
        zonasCobertura: ['Chapinero'],
        calificacion: { promedio: 4.8, total: 5 },
      },
    },
    {
      nombre: 'Marta',
      email: 'marta@example.com',
      roles: ['prestador'],
      perfilPrestador: {
        zonasCobertura: ['Usaquén'],
        calificacion: { promedio: 4.5, total: 2 },
      },
    },
  ]);

  const servicioId = new mongoose.Types.ObjectId();
  await Orden.create([
    {
      cliente: cliente._id,
      servicio: servicioId,
      prestador: joao._id,
      descripcion: 'Orden 1',
      estado: 'calificada',
    },
    {
      cliente: cliente._id,
      servicio: servicioId,
      prestador: joao._id,
      descripcion: 'Orden 2',
      estado: 'pagada',
    },
    {
      cliente: cliente._id,
      servicio: servicioId,
      prestador: joao._id,
      descripcion: 'Orden 3',
      estado: 'solicitada',
    },
    {
      cliente: cliente._id,
      servicio: servicioId,
      prestador: marta._id,
      descripcion: 'Orden 4',
      estado: 'finalizada',
    },
  ]);

  const sesionAdmin = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: 'clave12345' });
  tokenAdmin = sesionAdmin.body.token;

  const sesionCliente = await request(app)
    .post('/api/auth/login')
    .send({ email: cliente.email, password: 'clave12345' });
  tokenCliente = sesionCliente.body.token;
});

test('RP-02 exige rol admin', async () => {
  const sinToken = await request(app).get('/api/reportes/ranking-prestadores');
  assert.equal(sinToken.status, 401);

  const comoCliente = await request(app)
    .get('/api/reportes/ranking-prestadores')
    .set('Authorization', `Bearer ${tokenCliente}`);
  assert.equal(comoCliente.status, 403);
});

test('RP-02 ordena por calificacion y cuenta ordenes completadas', async () => {
  const res = await request(app)
    .get('/api/reportes/ranking-prestadores')
    .set('Authorization', `Bearer ${tokenAdmin}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.reporte, 'RP-02');
  assert.equal(res.body.ranking.length, 2);

  const [primero, segundo] = res.body.ranking;
  assert.equal(primero.nombre, 'Joao');
  assert.equal(primero.ordenesCompletadas, 2);
  assert.equal(primero.calificacionPromedio, 4.8);
  assert.equal(primero.posicion, 1);
  assert.equal(segundo.nombre, 'Marta');
  assert.equal(segundo.ordenesCompletadas, 1);
});

test('RP-02 filtra por zona y limita resultados', async () => {
  const porZona = await request(app)
    .get('/api/reportes/ranking-prestadores?zona=Usaquén')
    .set('Authorization', `Bearer ${tokenAdmin}`);
  assert.equal(porZona.body.ranking.length, 1);
  assert.equal(porZona.body.ranking[0].nombre, 'Marta');

  const limitado = await request(app)
    .get('/api/reportes/ranking-prestadores?limite=1')
    .set('Authorization', `Bearer ${tokenAdmin}`);
  assert.equal(limitado.body.ranking.length, 1);
  assert.equal(limitado.body.ranking[0].nombre, 'Joao');
});
