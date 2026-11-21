const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { ErrorHttp } = require('../middlewares/errores');

// El archivo queda en public/uploads; en MongoDB solo se guarda su ruta
const CARPETA = path.join(__dirname, '..', '..', 'public', 'uploads');
const EXTENSIONES = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const TAMANO_MAXIMO = 2 * 1024 * 1024; // 2 MB

async function subir(req, res) {
  const partes = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.dataUrl || '');
  if (!partes) throw new ErrorHttp(400, 'Se esperaba una imagen JPG, PNG o WEBP');

  const datos = Buffer.from(partes[2], 'base64');
  if (datos.length > TAMANO_MAXIMO) throw new ErrorHttp(413, 'La imagen supera los 2 MB');

  await fs.mkdir(CARPETA, { recursive: true });
  const nombre = `${crypto.randomBytes(8).toString('hex')}.${EXTENSIONES[partes[1]]}`;
  await fs.writeFile(path.join(CARPETA, nombre), datos);

  res.status(201).json({ url: `/uploads/${nombre}` });
}

module.exports = { subir };
