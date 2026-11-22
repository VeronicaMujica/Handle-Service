// Borra las colecciones y carga datos de ejemplo
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const conectarDB = require('../config/db');
const Categoria = require('../models/Categoria');
const Servicio = require('../models/Servicio');
const Prestador = require('../models/Prestador');
const Usuario = require('../models/Usuario');
const Orden = require('../models/Orden');
const { hashearPassword } = require('../utils/password');

async function sembrar() {
  await conectarDB();
  await Promise.all([
    Categoria.deleteMany({}),
    Servicio.deleteMany({}),
    Prestador.deleteMany({}),
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
    { nombre: 'Hogar', descripcion: 'Arreglos y mantenimiento de la casa' },
    { nombre: 'Idiomas', descripcion: 'Traducción e interpretación' },
    { nombre: 'Eventos y ceremonias', descripcion: 'Acompañamiento en eventos poco comunes' },
  ]);

  const [luces, , portugués, doliente] = await Servicio.create([
    {
      nombre: 'Cambio de luminarias',
      descripcion: 'Cambio de bombillos, lámparas y luces de la casa',
      categoriaId: hogar._id,
      etiquetas: ['electricidad', 'luces', 'bombillos'],
      modalidades: ['domicilio'],
    },
    {
      nombre: 'Pintura de paredes',
      descripcion: 'Pintura de interiores y exteriores',
      categoriaId: hogar._id,
      etiquetas: ['pintura', 'paredes', 'remodelación'],
      modalidades: ['domicilio'],
    },
    {
      nombre: 'Intérprete de portugués para reuniones',
      descripcion: 'Traducción simultánea portugués-español en reuniones de trabajo',
      categoriaId: idiomas._id,
      etiquetas: ['traductor', 'portugués', 'reunión'],
      modalidades: ['remoto', 'local'],
    },
    {
      nombre: 'Doliente profesional',
      descripcion: 'Persona que asiste y llora en un funeral o velorio',
      categoriaId: eventos._id,
      etiquetas: ['funeral', 'llorar', 'velorio', 'acompañante'],
      modalidades: ['local'],
      esInusual: true,
    },
  ]);

  const [marta, joao] = await Prestador.create([
    {
      nombre: 'Marta Ríos',
      email: 'marta.rios@example.com',
      passwordHash: martaHash,
      telefono: '3001112233',
      descripcion: 'Actriz de teatro. Acompañamiento en ceremonias.',
      ciudad: 'Bogotá',
      zonas: ['Chapinero', 'Usaquén'],
      serviciosOfrecidos: [
        { servicioId: doliente._id, tarifaBase: 150000, unidad: 'servicio', experienciaAnios: 4 },
      ],
      certificaciones: [
        { titulo: 'Técnica en artes escénicas', entidad: 'Academia de Artes', verificada: true },
      ],
      estado: 'verificado',
    },
    {
      nombre: 'Joao Pereira',
      email: 'joao.pereira@example.com',
      passwordHash: joaoHash,
      telefono: '3004445566',
      descripcion: 'Intérprete nativo de portugués. También hace arreglos eléctricos.',
      ciudad: 'Bogotá',
      zonas: ['Chapinero', 'Teusaquillo'],
      serviciosOfrecidos: [
        { servicioId: portugués._id, tarifaBase: 90000, unidad: 'hora', experienciaAnios: 7 },
        { servicioId: luces._id, tarifaBase: 40000, unidad: 'servicio', experienciaAnios: 2 },
      ],
      estado: 'verificado',
    },
  ]);

  await Servicio.updateMany(
    { _id: { $in: [luces._id, portugués._id] } },
    { creadoPor: joao._id }
  );
  await Servicio.updateOne({ _id: doliente._id }, { creadoPor: marta._id });

  const [ana] = await Usuario.create([
    {
      nombre: 'Ana Gómez',
      email: 'ana.gomez@example.com',
      passwordHash: anaHash,
      telefono: '3109998877',
      ciudad: 'Bogotá',
      direcciones: [{ etiqueta: 'Casa', direccion: 'Cra 7 # 45-10', zona: 'Chapinero' }],
    },
    {
      nombre: 'Administrador',
      email: 'admin@example.com',
      passwordHash: adminHash,
      rol: 'admin',
      ciudad: 'Bogotá',
    },
  ]);

  await Prestador.updateOne(
    { _id: joao._id },
    { calificacionPromedio: 4.8, totalCalificaciones: 4 }
  );
  await Prestador.updateOne(
    { _id: marta._id },
    { calificacionPromedio: 4.5, totalCalificaciones: 2 }
  );

  await Orden.create([
    {
      clienteId: ana._id,
      servicioId: portugués._id,
      descripcion: 'Reunión de 2 horas con proveedor de Brasil',
      modalidad: 'remoto',
      zona: 'Chapinero',
      estado: 'solicitada',
      historialEstados: [
        { estado: 'solicitada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Orden creada' },
      ],
    },
    {
      clienteId: ana._id,
      servicioId: portugués._id,
      prestadorId: joao._id,
      descripcion: 'Interpretación en reunión con proveedor de Brasil',
      modalidad: 'remoto',
      zona: 'Chapinero',
      estado: 'calificada',
      precioAcordado: 180000,
      historialEstados: [
        { estado: 'solicitada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Orden creada' },
        { estado: 'asignada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Cotización aceptada' },
        { estado: 'finalizada', actor: { tipo: 'prestador', id: joao._id } },
        { estado: 'pagada', actor: { tipo: 'cliente', id: ana._id } },
        { estado: 'calificada', actor: { tipo: 'cliente', id: ana._id }, nota: 'Excelente servicio' },
      ],
    },
    {
      clienteId: ana._id,
      servicioId: doliente._id,
      prestadorId: marta._id,
      descripcion: 'Acompañamiento en velorio familiar',
      modalidad: 'local',
      zona: 'Usaquén',
      estado: 'finalizada',
      precioAcordado: 150000,
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
    prestadores: await Prestador.countDocuments(),
    usuarios: await Usuario.countDocuments(),
    ordenes: await Orden.countDocuments(),
  });
  await mongoose.disconnect();
}

sembrar().catch((error) => {
  console.error('[Seed] Error:', error.message);
  process.exit(1);
});
