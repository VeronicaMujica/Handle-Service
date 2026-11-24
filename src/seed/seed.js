// Borra las colecciones y carga datos de ejemplo en el formato actual.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const conectarDB = require('../config/db');
const Categoria = require('../models/Categoria');
const Servicio = require('../models/Servicio');
const Usuario = require('../models/Usuario');
const Orden = require('../models/Orden');
const { hashearPassword } = require('../utils/password');

async function sembrar() {
  await conectarDB();
  await Promise.all([
    Categoria.deleteMany({}),
    Servicio.deleteMany({}),
    Usuario.deleteMany({}),
    Orden.deleteMany({}),
  ]);

  const [anaHash, martaHash, joaoHash, adminHash] = await Promise.all([
    hashearPassword('ana12345'),
    hashearPassword('marta12345'),
    hashearPassword('joao12345'),
    hashearPassword('admin12345'),
  ]);

  const [hogar, idiomas, eventos] = await Categoria.create([
    { nombre: 'Hogar', descripcion: 'Arreglos y mantenimiento de la casa', estado: 'activo' },
    { nombre: 'Idiomas', descripcion: 'Traducción e interpretación', estado: 'activo' },
    {
      nombre: 'Eventos y ceremonias',
      descripcion: 'Acompañamiento en eventos poco comunes',
      estado: 'activo',
    },
  ]);

  const [luces, , portugues, doliente] = await Servicio.create([
    {
      nombre: 'Cambio de luminarias',
      descripcion: 'Cambio de bombillos, lámparas y luces de la casa',
      categoria: hogar.nombre,
      categoriaId: hogar._id,
      etiquetas: ['electricidad', 'luces', 'bombillos'],
      modalidades: ['domicilio'],
    },
    {
      nombre: 'Pintura de paredes',
      descripcion: 'Pintura de interiores y exteriores',
      categoria: hogar.nombre,
      categoriaId: hogar._id,
      etiquetas: ['pintura', 'paredes', 'remodelación'],
      modalidades: ['domicilio'],
    },
    {
      nombre: 'Intérprete de portugués para reuniones',
      descripcion: 'Traducción simultánea portugués-español en reuniones de trabajo',
      categoria: idiomas.nombre,
      categoriaId: idiomas._id,
      etiquetas: ['traductor', 'portugués', 'reunión'],
      modalidades: ['remoto', 'local'],
    },
    {
      nombre: 'Doliente profesional',
      descripcion: 'Persona que asiste y llora en un funeral o velorio',
      categoria: eventos.nombre,
      categoriaId: eventos._id,
      etiquetas: ['funeral', 'llorar', 'velorio', 'acompañante'],
      modalidades: ['local'],
      inusual: true,
    },
  ]);

  const [marta, joao] = await Usuario.create([
    {
      nombre: 'Marta Ríos',
      email: 'marta.rios@example.com',
      passwordHash: martaHash,
      roles: ['prestador'],
      telefono: '3001112233',
      ciudad: 'Bogotá',
      perfilPrestador: {
        telefono: '3001112233',
        descripcion: 'Actriz de teatro. Acompañamiento en ceremonias.',
        zonasCobertura: ['Chapinero', 'Usaquén'],
        modalidades: ['local'],
        estado: 'verificado',
        servicios: [
          {
            _id: doliente._id,
            nombre: doliente.nombre,
            categoria: doliente.categoria,
            tarifa: 150000,
            tarifaBase: 150000,
            unidad: 'servicio',
            experienciaAnios: 4,
          },
        ],
        certificaciones: [
          {
            nombre: 'Técnica en artes escénicas',
            titulo: 'Técnica en artes escénicas',
            institucion: 'Academia de Artes',
            entidad: 'Academia de Artes',
            vigente: true,
          },
        ],
        calificacion: { promedio: 4.5, total: 2 },
      },
    },
    {
      nombre: 'Joao Pereira',
      email: 'joao.pereira@example.com',
      passwordHash: joaoHash,
      roles: ['prestador'],
      telefono: '3004445566',
      ciudad: 'Bogotá',
      perfilPrestador: {
        telefono: '3004445566',
        descripcion: 'Intérprete nativo de portugués. También hace arreglos eléctricos.',
        zonasCobertura: ['Chapinero', 'Teusaquillo'],
        modalidades: ['remoto', 'domicilio'],
        estado: 'verificado',
        servicios: [
          {
            _id: portugues._id,
            nombre: portugues.nombre,
            categoria: portugues.categoria,
            tarifa: 90000,
            tarifaBase: 90000,
            unidad: 'hora',
            experienciaAnios: 7,
          },
          {
            _id: luces._id,
            nombre: luces.nombre,
            categoria: luces.categoria,
            tarifa: 40000,
            tarifaBase: 40000,
            unidad: 'servicio',
            experienciaAnios: 2,
          },
        ],
        calificacion: { promedio: 4.8, total: 4 },
      },
    },
  ]);

  await Servicio.updateMany(
    { _id: { $in: [luces._id, portugues._id] } },
    { creadoPor: joao._id }
  );
  await Servicio.updateOne({ _id: doliente._id }, { creadoPor: marta._id });

  const [ana] = await Usuario.create([
    {
      nombre: 'Ana Gómez',
      email: 'ana.gomez@example.com',
      passwordHash: anaHash,
      roles: ['cliente'],
      telefono: '3109998877',
      ciudad: 'Bogotá',
      zona: 'Chapinero',
      direcciones: [{ etiqueta: 'Casa', direccion: 'Cra 7 # 45-10', zona: 'Chapinero' }],
      caracterizacion: { intereses: ['idiomas', 'eventos'] },
      idiomas: ['español'],
      habilidades: ['organización de eventos'],
    },
    {
      nombre: 'Administrador',
      email: 'admin@example.com',
      passwordHash: adminHash,
      roles: ['administrador'],
      ciudad: 'Bogotá',
    },
  ]);

  await Orden.create([
    {
      cliente: ana._id,
      clienteId: ana._id,
      servicio: portugues._id,
      servicioId: portugues._id,
      descripcion: 'Reunión de 2 horas con proveedor de Brasil',
      snapshot: {
        nombreCliente: ana.nombre,
        nombreServicio: portugues.nombre,
        categoria: portugues.categoria,
        modalidad: 'remoto',
        zona: 'Chapinero',
        inusual: false,
        descripcionSolicitud: 'Reunión de 2 horas con proveedor de Brasil',
      },
      modalidad: 'remoto',
      zona: 'Chapinero',
      estado: 'solicitada',
      historialEstados: [
        { estado: 'solicitada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Orden creada' },
      ],
    },
    {
      cliente: ana._id,
      clienteId: ana._id,
      servicio: portugues._id,
      servicioId: portugues._id,
      prestador: joao._id,
      prestadorId: joao._id,
      descripcion: 'Interpretación en reunión con proveedor de Brasil',
      modalidad: 'remoto',
      zona: 'Chapinero',
      estado: 'calificada',
      precioAcordado: 180000,
      snapshot: {
        nombreCliente: ana.nombre,
        nombrePrestador: joao.nombre,
        nombreServicio: portugues.nombre,
        categoria: portugues.categoria,
        modalidad: 'remoto',
        zona: 'Chapinero',
        tarifa: 180000,
        inusual: false,
        descripcionSolicitud: 'Interpretación en reunión con proveedor de Brasil',
      },
      calificacion: { puntaje: 5, comentario: 'Excelente servicio', fecha: new Date() },
      historialEstados: [
        { estado: 'solicitada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Orden creada' },
        { estado: 'asignada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Cotización aceptada' },
        { estado: 'finalizada', actor: { tipo: 'prestador', id: joao._id } },
        { estado: 'pagada', actor: { tipo: 'cliente', id: ana._id } },
        { estado: 'calificada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Excelente servicio' },
      ],
    },
    {
      cliente: ana._id,
      clienteId: ana._id,
      servicio: doliente._id,
      servicioId: doliente._id,
      prestador: marta._id,
      prestadorId: marta._id,
      descripcion: 'Acompañamiento en velorio familiar',
      modalidad: 'local',
      zona: 'Usaquén',
      estado: 'finalizada',
      precioAcordado: 150000,
      snapshot: {
        nombreCliente: ana.nombre,
        nombrePrestador: marta.nombre,
        nombreServicio: doliente.nombre,
        categoria: doliente.categoria,
        modalidad: 'local',
        zona: 'Usaquén',
        tarifa: 150000,
        inusual: true,
        descripcionSolicitud: 'Acompañamiento en velorio familiar',
      },
      historialEstados: [
        { estado: 'solicitada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Orden creada' },
        { estado: 'asignada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Cotización aceptada' },
        { estado: 'en_ejecucion', actor: { tipo: 'prestador', id: marta._id } },
        { estado: 'finalizada', actor: { tipo: 'prestador', id: marta._id } },
      ],
    },
  ]);

  console.log('[Seed] Datos cargados:', {
    categorias: await Categoria.countDocuments(),
    servicios: await Servicio.countDocuments(),
    prestadores: await Usuario.countDocuments({ perfilPrestador: { $exists: true } }),
    usuarios: await Usuario.countDocuments(),
    ordenes: await Orden.countDocuments(),
  });
  await mongoose.disconnect();
}

const ejecucion = sembrar().catch((error) => {
  console.error('[Seed] Error:', error.message);
  process.exit(1);
});

module.exports = ejecucion;
