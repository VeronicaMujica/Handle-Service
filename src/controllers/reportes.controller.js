const Prestador = require('../models/Prestador');

const ESTADOS_COMPLETADOS = ['finalizada', 'pagada', 'calificada'];

async function rankingPrestadores(req, res) {
  const filtro = {};
  if (req.query.zona) filtro.zonas = String(req.query.zona);
  if (req.query.estado) filtro.estado = String(req.query.estado);
  if (req.query.minCalificacion !== undefined) {
    const minima = Number(req.query.minCalificacion);
    if (Number.isFinite(minima)) filtro.calificacionPromedio = { $gte: minima };
  }

  const limite = Math.min(Number.parseInt(req.query.limite, 10) || 10, 100);

  const pipeline = [
    { $match: filtro },
    {
      $lookup: {
        from: 'ordenes',
        let: { prestadorId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$prestadorId', '$$prestadorId'] },
                  { $in: ['$estado', ESTADOS_COMPLETADOS] },
                ],
              },
            },
          },
          { $count: 'total' },
        ],
        as: 'completadas',
      },
    },
    {
      $addFields: {
        ordenesCompletadas: {
          $ifNull: [{ $arrayElemAt: ['$completadas.total', 0] }, 0],
        },
      },
    },
    { $unset: 'completadas' },
    {
      $sort: { calificacionPromedio: -1, ordenesCompletadas: -1, nombre: 1 },
    },
    { $limit: limite },
    {
      $project: {
        nombre: 1,
        calificacionPromedio: 1,
        totalCalificaciones: 1,
        ordenesCompletadas: 1,
        estado: 1,
        zonas: 1,
        serviciosOfrecidos: { $size: { $ifNull: ['$serviciosOfrecidos', []] } },
      },
    },
  ];

  const resultados = await Prestador.aggregate(pipeline);
  const ranking = resultados.map((p, indice) => ({
    posicion: indice + 1,
    id: String(p._id),
    nombre: p.nombre,
    calificacionPromedio: p.calificacionPromedio,
    totalCalificaciones: p.totalCalificaciones,
    ordenesCompletadas: p.ordenesCompletadas,
    estado: p.estado,
    zonas: p.zonas,
    serviciosOfrecidos: p.serviciosOfrecidos,
  }));

  res.json({
    reporte: 'RP-02',
    generadoEn: new Date(),
    estadoConsideradoCompletado: ESTADOS_COMPLETADOS,
    total: ranking.length,
    ranking,
  });
}

module.exports = { rankingPrestadores, ESTADOS_COMPLETADOS };
