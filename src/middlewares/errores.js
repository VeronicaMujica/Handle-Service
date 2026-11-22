class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

function manejadorErrores(err, req, res, next) {
  if (err.name === 'ValidationError') {
    const detalles = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: 'Datos invalidos', detalles });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Valor invalido para "${err.path}": ${err.value}` });
  }
  if (err.code === 11000) {
    const campo = Object.keys(err.keyValue || {}).join(', ');
    return res.status(409).json({ error: `Ya existe un registro con ese valor (${campo})` });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado es demasiado grande' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la peticion no es JSON valido' });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { ErrorHttp, rutaNoEncontrada, manejadorErrores };
