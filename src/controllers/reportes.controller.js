const Usuario = require('../models/Usuario');

const ESTADOS_COMPLETADOS = ['finalizada', 'pagada', 'calificada'];

async function rankingPrestadores(req, res) {
  const filtro = { perfilPrestador: { $exists: true, $ne: null } };
  if (req.query.zona) filtro['perfilPrestador.zonasCobertura'] = String(req.query.zona);
  if (req.query.estado) filtro['perfilPrestador.estado'] = String(req.query.estado);
  if (req.query.minCalificacion !== undefined) {
    const minima = Number(req.query.minCalificacion);
    if (Number.isFinite(minima)) {
      filtro['perfilPrestador.calificacion.promedio'] = { $gte: minima };
    }
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
                  {
                    $or: [
                      { $eq: ['$prestador', '$$prestadorId'] },
                      { $eq: ['$prestadorId', '$$prestadorId'] },
                    ],
                  },
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
      $sort: {
        'perfilPrestador.calificacion.promedio': -1,
        ordenesCompletadas: -1,
        nombre: 1,
      },
    },
    { $limit: limite },
    {
      $project: {
        nombre: 1,
        perfilPrestador: 1,
        ordenesCompletadas: 1,
        estado: 1,
      },
    },
  ];

  const resultados = await Usuario.aggregate(pipeline);
  const ranking = resultados.map((usuario, indice) => {
    const perfil = usuario.perfilPrestador || {};
    const promedio = perfil.calificacion?.promedio || 0;
    const total = perfil.calificacion?.total || 0;
    return {
      posicion: indice + 1,
      id: String(usuario._id),
      nombre: usuario.nombre,
      calificacion: perfil.calificacion || { promedio, total },
      calificacionPromedio: promedio,
      totalCalificaciones: total,
      ordenesCompletadas: usuario.ordenesCompletadas,
      estado: perfil.estado || 'pendiente',
      zonasCobertura: perfil.zonasCobertura || [],
      zonas: perfil.zonasCobertura || [],
      serviciosOfrecidos: (perfil.servicios || []).length,
    };
  });

  res.json({
    reporte: 'RP-02',
    generadoEn: new Date(),
    estadoConsideradoCompletado: ESTADOS_COMPLETADOS,
    total: ranking.length,
    ranking,
  });
}

module.exports = { rankingPrestadores, ESTADOS_COMPLETADOS };
