// ---------- Utilidades ----------
const $ = (sel) => document.querySelector(sel);
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const fecha = (d) => (d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const lista = (texto) => String(texto || '').split(',').map((t) => t.trim()).filter(Boolean);

const sesion = {
  token: localStorage.getItem('handleToken') || null,
  usuario: (() => {
    try { return JSON.parse(localStorage.getItem('handleSesion') || 'null'); }
    catch { return null; }
  })(),
};

async function api(ruta, metodo = 'GET', cuerpo) {
  const headers = {};
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  if (sesion.token) headers.Authorization = 'Bearer ' + sesion.token;
  const res = await fetch('/api' + ruta, {
    method: metodo,
    headers,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  if (res.status === 204) return null;
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && sesion.token && !ruta.startsWith('/auth/')) cerrarSesion(false);
    const detalle = datos.detalles ? ': ' + datos.detalles.join('; ') : '';
    throw new Error((datos.error || 'Error ' + res.status) + detalle);
  }
  return datos;
}

const ALIAS_ROLES = { usuario: 'cliente', admin: 'administrador' };
function rolesSesion() {
  const u = sesion.usuario;
  if (!u) return [];
  const base = Array.isArray(u.roles) && u.roles.length ? u.roles : [u.rol];
  return [...new Set(base.map((r) => ALIAS_ROLES[r] || r).filter(Boolean))];
}
const esAdmin = () => rolesSesion().includes('administrador');
const esPrestador = () => rolesSesion().includes('prestador');
const esCliente = () => rolesSesion().includes('cliente');
const rolVisible = () => esAdmin() ? 'admin' : esPrestador() ? 'prestador' : 'usuario';

function aplicarSesion() {
  document.body.dataset.sesion = sesion.usuario ? '1' : '0';
  document.body.dataset.rol = rolVisible();
  $('#sesion').textContent = sesion.usuario
    ? `${sesion.usuario.nombre} · ${rolVisible()}`
    : '';
  $('#sesionBoton').textContent = sesion.usuario ? 'Salir' : 'Ingresar';
  document.querySelectorAll('[data-rol-permitido]').forEach((el) => {
    const permitidos = el.dataset.rolPermitido.split(' ').map((r) => ALIAS_ROLES[r] || r);
    el.hidden = !sesion.usuario || !permitidos.some((r) => rolesSesion().includes(r));
  });
}

function guardarSesion(datos) {
  sesion.token = datos.token;
  sesion.usuario = datos.usuario;
  localStorage.setItem('handleToken', datos.token);
  localStorage.setItem('handleSesion', JSON.stringify(datos.usuario));
  aplicarSesion();
}

function cerrarSesion(avisar = true) {
  sesion.token = null;
  sesion.usuario = null;
  localStorage.removeItem('handleToken');
  localStorage.removeItem('handleSesion');
  aplicarSesion();
  pintar();
  if (avisar) aviso('Sesión cerrada');
}

function abrirSesion(modo = 'login') {
  const registro = modo === 'registro';
  $('#modal').innerHTML = `
    <button class="cerrar" data-cerrar type="button">×</button>
    <h2>${registro ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
    <form id="formSesion" class="formulario" data-modo="${modo}">
      ${registro ? `<div class="campo ancho"><label>Rol</label><select name="rol">
        <option value="usuario">Cliente</option><option value="prestador">Prestador de servicio</option>
      </select></div><div class="campo ancho"><label>Nombre</label><input name="nombre" required></div>` : ''}
      <div class="campo ancho"><label>Email</label><input name="email" type="email" required></div>
      <div class="campo ancho"><label>Contraseña</label><input name="password" type="password" required minlength="8"></div>
      <div class="acciones"><button class="boton oscuro">${registro ? 'Registrarme' : 'Ingresar'}</button></div>
    </form>
    <p class="meta" style="margin-top:14px">${registro ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
      <button class="enlace" data-accion="${registro ? 'modo-login' : 'modo-registro'}">${registro ? 'Inicia sesión' : 'Regístrate'}</button></p>
    ${registro ? '' : '<p class="meta" style="margin-top:6px">Prueba: ana.gomez@example.com / ana12345</p>'}`;
  $('#modal').showModal();
}

async function enviarSesion(form) {
  const datos = Object.fromEntries(new FormData(form));
  const ruta = form.dataset.modo === 'registro' ? '/auth/registro' : '/auth/login';
  try {
    const res = await api(ruta, 'POST', datos);
    guardarSesion(res);
    $('#modal').close();
    aviso(`Bienvenido, ${res.usuario.nombre}`);
    await cargarTodo();
  } catch (error) {
    aviso(error.message, true);
  }
}

function aviso(texto, esError) {
  const el = document.createElement('div');
  el.className = 'aviso' + (esError ? ' error' : '');
  el.textContent = texto;
  $('#avisos').append(el);
  setTimeout(() => el.remove(), esError ? 6000 : 3000);
}

async function ejecutar(accion, mensajeOk) {
  try {
    await accion();
    if (mensajeOk) aviso(mensajeOk);
    await cargarTodo();
    return true;
  } catch (error) {
    aviso(error.message, true);
    return false;
  }
}

// ---------- Estado ----------
const estado = { categorias: [], servicios: [], prestadores: [], usuarios: [], ordenes: [] };
const filtros = { q: '', inusual: false, modalidad: '', categoriaId: '' };
let resultados = []; // servicios que devuelve la busqueda

const TRANSICIONES = {
  solicitada: ['cotizada', 'asignada', 'aceptada', 'cancelada'],
  cotizada: ['asignada', 'aceptada', 'cancelada'],
  asignada: ['agendada', 'cancelada'],
  aceptada: ['agendada', 'cancelada'],
  agendada: ['en_ejecucion', 'cancelada'],
  en_ejecucion: ['finalizada', 'en_reclamo'],
  finalizada: ['pagada', 'en_reclamo'],
  pagada: ['calificada', 'en_reclamo'],
  calificada: [],
  cancelada: [],
  en_reclamo: ['finalizada', 'cancelada'],
};
const COLOR_ESTADO = {
  solicitada: 'ambar', cotizada: 'ambar', asignada: 'azul', aceptada: 'azul', agendada: 'azul', en_ejecucion: 'azul',
  finalizada: 'verde', pagada: 'verde', calificada: 'verde', cancelada: 'rojo', en_reclamo: 'rojo',
  verificado: 'verde', pendiente: 'ambar', suspendido: 'rojo',
};
const textoEstado = (e) => String(e).replace('_', ' ');
const ACCION = {
  cotizada: 'Enviar cotización', asignada: 'Aceptar y asignar prestador', aceptada: 'Aceptar y asignar prestador', agendada: 'Agendar fecha',
  en_ejecucion: 'Iniciar servicio', finalizada: 'Marcar como finalizado', pagada: 'Registrar pago',
  calificada: 'Marcar como calificada', cancelada: 'Cancelar', en_reclamo: 'Abrir reclamo',
};
const SIGUIENTE = {
  solicitada: 'un prestador envía su cotización.',
  cotizada: 'el cliente acepta la cotización y se asigna el prestador.',
  asignada: 'cliente y prestador acuerdan la fecha.',
  aceptada: 'cliente y prestador acuerdan la fecha.',
  agendada: 'el prestador inicia el servicio el día acordado.',
  en_ejecucion: 'el prestador marca el servicio como finalizado.',
  finalizada: 'el cliente paga el servicio.',
  pagada: 'el cliente califica al prestador.',
  en_reclamo: 'se resuelve el reclamo.',
};
const chipEstado = (e) => `<span class="estado ${COLOR_ESTADO[e] || ''}">${esc(textoEstado(e))}</span>`;

const porId = (coleccion, id) => estado[coleccion].find((x) => x._id === String(id?._id || id));
const nombreDe = (coleccion, id) => porId(coleccion, id)?.nombre || '(eliminado)';

function ofertasDe(servicioId) {
  return estado.prestadores
    .map((p) => ({ prestador: p, oferta: p.serviciosOfrecidos.find((s) => s.servicioId === servicioId) }))
    .filter((x) => x.oferta)
    .sort((a, b) => a.oferta.tarifaBase - b.oferta.tarifaBase);
}

async function cargarTodo() {
  const [categorias, servicios, prestadores, usuarios, ordenes] = await Promise.all([
    api('/categorias'), api('/servicios'), api('/prestadores'), api('/usuarios'),
    api('/ordenes').catch(() => []),
  ]);
  Object.assign(estado, { categorias, servicios, prestadores, usuarios, ordenes });
  await buscar(false);
  pintarClientes();
  pintar();
}

async function buscar(repintar = true) {
  const p = new URLSearchParams();
  if (filtros.q) p.set('q', filtros.q);
  if (filtros.inusual) p.set('inusual', 'true');
  if (filtros.modalidad) p.set('modalidad', filtros.modalidad);
  if (filtros.categoriaId) p.set('categoriaId', filtros.categoriaId);
  resultados = await api('/servicios?' + p);
  if (repintar) pintar();
}

function pintarClientes() {
  const sel = $('#clienteActual');
  const actual = esCliente() ? sesion.usuario.id : sel.value || localStorage.getItem('clienteActual');
  sel.innerHTML = estado.usuarios.length
    ? estado.usuarios.map((u) => `<option value="${u._id}">${esc(u.nombre)}</option>`).join('')
    : '<option value="">(sin clientes)</option>';
  if (estado.usuarios.some((u) => u._id === actual)) sel.value = actual;
}

// ---------- Formularios ----------
function campoHTML(c) {
  const req = c.requerido ? 'required' : '';
  const v = c.valor ?? '';
  let control;
  if (c.tipo === 'textarea') {
    control = `<textarea name="${c.nombre}" ${req}>${esc(v)}</textarea>`;
  } else if (c.tipo === 'select') {
    control = `<select name="${c.nombre}" ${req}>${c.opciones
      .map(([valor, texto]) => `<option value="${esc(valor)}" ${String(valor) === String(v) ? 'selected' : ''}>${esc(texto)}</option>`)
      .join('')}</select>`;
  } else if (c.tipo === 'multiple') {
    control = `<div class="opciones">${c.opciones
      .map(([valor, texto]) => `<label><input type="checkbox" name="${c.nombre}" value="${esc(valor)}" ${(v || []).includes(valor) ? 'checked' : ''}>${esc(texto)}</label>`)
      .join('')}</div>`;
  } else if (c.tipo === 'imagen') {
    control = `<div class="subir-imagen">
      <img class="vista-previa" src="${esc(v)}" alt="" ${v ? '' : 'hidden'}>
      <div><input type="file" accept="image/*" data-subir aria-label="Elegir foto">
      <input type="text" name="${c.nombre}" value="${esc(v)}" placeholder="…o pega el enlace de una imagen"></div>
    </div>`;
  } else if (c.tipo === 'casilla') {
    control = `<div class="opciones"><label><input type="checkbox" name="${c.nombre}" ${v ? 'checked' : ''}>${esc(c.ayuda || 'Sí')}</label></div>`;
  } else {
    const sugerencias = c.sugerencias
      ? `<datalist id="lista-${c.nombre}">${c.sugerencias.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`
      : '';
    control = `<input type="${c.tipo || 'text'}" name="${c.nombre}" value="${esc(v)}" ${req} ${c.tipo === 'number' ? 'min="0" step="any"' : ''} ${c.sugerencias ? `list="lista-${c.nombre}" autocomplete="off"` : ''} placeholder="${esc(c.ayuda || '')}">${sugerencias}`;
  }
  return `<label class="campo ${c.ancho ? 'ancho' : ''}"><span>${esc(c.etiqueta)}${c.requerido ? ' *' : ''}</span>${control}</label>`;
}

function leerFormulario(form, campos) {
  const datos = {};
  for (const c of campos) {
    if (c.tipo === 'multiple') datos[c.nombre] = [...form.querySelectorAll(`[name="${c.nombre}"]:checked`)].map((i) => i.value);
    else if (c.tipo === 'casilla') datos[c.nombre] = form.elements[c.nombre].checked;
    else if (c.tipo === 'number') datos[c.nombre] = form.elements[c.nombre].value === '' ? undefined : Number(form.elements[c.nombre].value);
    else datos[c.nombre] = form.elements[c.nombre].value.trim();
  }
  return datos;
}

function formularioHTML(campos, textoBoton, conCancelar) {
  return `<form class="formulario">${campos.map(campoHTML).join('')}
    <div class="acciones">
      ${conCancelar ? '<button type="button" class="boton" data-cerrar>Cancelar</button>' : ''}
      <button class="boton oscuro">${esc(textoBoton)}</button>
    </div></form>`;
}

function abrirFormulario(titulo, campos, textoBoton, alEnviar, htmlPrevio = '') {
  const modal = $('#modal');
  modal.innerHTML = `<button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button><h2>${esc(titulo)}</h2>${htmlPrevio}${formularioHTML(campos, textoBoton, true)}`;
  modal.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (await alEnviar(leerFormulario(ev.target, campos))) modal.close();
  });
  modal.showModal();
  modal.querySelector('form input, form select, form textarea')?.focus();
}

function abrirModal(html) {
  const modal = $('#modal');
  modal.innerHTML = '<button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button>' + html;
  modal.showModal();
}

// ---------- Fotos ----------
function reducirImagen(archivo, maximo = 900) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(img.src);
      resolver(lienzo.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => rechazar(new Error('el archivo no es una imagen válida'));
    img.src = URL.createObjectURL(archivo);
  });
}

function mostrarVistaPrevia(caja, url) {
  const img = caja.querySelector('.vista-previa');
  img.hidden = !url;
  if (url) img.src = url;
}

async function subirImagen(input) {
  const archivo = input.files[0];
  if (!archivo) return;
  const caja = input.closest('.subir-imagen');
  try {
    const { url } = await api('/imagenes', 'POST', { dataUrl: await reducirImagen(archivo) });
    caja.querySelector('input[type=text]').value = url;
    mostrarVistaPrevia(caja, url);
  } catch (error) {
    input.value = '';
    aviso('No se pudo subir la foto: ' + error.message, true);
  }
}

// ---------- Campos reutilizables ----------
const MODALIDADES = [['domicilio', 'A domicilio'], ['remoto', 'Remoto'], ['local', 'En un lugar']];
const opcionesServicio = () => estado.servicios.map((s) => [s._id, s.nombre]);

const camposServicio = (s = {}) => [
  { nombre: 'nombre', etiqueta: 'Título del servicio', requerido: true, ancho: true, valor: s.nombre, ayuda: 'Ej: Paseo iguanas los fines de semana' },
  { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', requerido: true, ancho: true, valor: s.descripcion },
  { nombre: 'imagen', etiqueta: 'Foto (opcional)', tipo: 'imagen', ancho: true, valor: s.imagen },
  { nombre: 'categoria', etiqueta: 'Categoría (elige una o escribe una nueva)', requerido: true, sugerencias: estado.categorias.map((c) => c.nombre), valor: s.categoria || s.categoriaId?.nombre, ayuda: 'Ej: Mascotas' },
  { nombre: 'etiquetas', etiqueta: 'Etiquetas (separadas por coma)', valor: (s.etiquetas || []).join(', '), ayuda: 'funeral, llorar, velorio' },
  { nombre: 'modalidades', etiqueta: 'Modalidad', tipo: 'multiple', opciones: MODALIDADES, valor: s.modalidades || ['domicilio'], ancho: true },
  { nombre: 'inusual', etiqueta: 'Tipo de servicio', tipo: 'casilla', valor: s.inusual ?? s.esInusual, ayuda: 'Es un servicio poco común', ancho: true },
];
const datosServicio = (d) => ({ ...d, etiquetas: lista(d.etiquetas) });

const camposPrestador = (p = {}) => {
  const datos = { ...(sesion.usuario || {}), ...p };
  return [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, valor: datos.nombre },
    { nombre: 'email', etiqueta: 'Correo', tipo: 'email', requerido: true, valor: datos.email },
    { nombre: 'telefono', etiqueta: 'Teléfono', valor: datos.telefono },
    { nombre: 'ciudad', etiqueta: 'Ciudad', valor: datos.ciudad },
    { nombre: 'zonas', etiqueta: 'Zonas que cubre (separadas por coma)', valor: (datos.zonas || []).join(', '), ancho: true, ayuda: 'Chapinero, Usaquén' },
    { nombre: 'descripcion', etiqueta: 'Presentación', tipo: 'textarea', valor: datos.descripcion, ancho: true },
  ];
};

const camposUsuario = (u = {}) => [
  { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, valor: u.nombre },
  { nombre: 'email', etiqueta: 'Correo', tipo: 'email', requerido: true, valor: u.email },
  { nombre: 'telefono', etiqueta: 'Teléfono', valor: u.telefono },
  { nombre: 'ciudad', etiqueta: 'Ciudad', valor: u.ciudad },
];

const camposCategoria = (c = {}) => [
  { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c.nombre },
  { nombre: 'descripcion', etiqueta: 'Descripción', valor: c.descripcion },
];

// ---------- Vista: Explorar ----------
function tarjetaServicio(s) {
  const mejor = ofertasDe(s._id)[0]?.oferta;
  return `<article class="tarjeta">
    <div class="tarjeta-foto">
      ${s.imagen ? `<img src="${esc(s.imagen)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      ${(s.inusual ?? s.esInusual) ? '<span class="sello-foto">Poco común</span>' : ''}
    </div>
    <div class="tarjeta-cuerpo">
    <div class="sobretitulo"><span>${esc(s.categoria || s.categoriaId?.nombre || 'Sin categoría')}</span></div>
    <h3>${esc(s.nombre)}</h3>
    <p class="resumen">${esc(s.descripcion)}</p>
    <div class="etiquetas">${s.etiquetas.slice(0, 3).map((e) => `<span>${esc(e)}</span>`).join('')}</div>
    <div class="tarjeta-pie">
      <span class="precio">${mejor ? `${dinero(mejor.tarifaBase)} <small>/ ${esc(mejor.unidad)}</small>` : '<small>Sin ofertas aún</small>'}</span>
      <button class="boton mini" data-accion="ver-servicio" data-id="${s._id}">Ver</button>
    </div>
  </div></article>`;
}

function vistaExplorar() {
  const chip = (texto, activo, accion, valor = '') =>
    `<button class="chip ${activo ? 'activo' : ''}" data-accion="${accion}" data-valor="${valor}">${texto}</button>`;
  const sinFiltros = !filtros.inusual && !filtros.modalidad && !filtros.categoriaId && !filtros.q;
  const conServicios = estado.categorias.filter((c) => estado.servicios.some((s) => s.categoriaId?._id === c._id));
  return `
  <section class="portada">
    <h1>¿Necesitas algo raro?<br>Alguien sabe hacerlo.</h1>
    <p>Escribe lo que necesitas, abre un servicio y solicítalo.</p>
    <form class="buscador" id="formBuscar">
      <input name="q" value="${esc(filtros.q)}" placeholder="funeral, portugués, luces…" aria-label="Qué necesitas">
      <button class="boton naranja">Buscar</button>
    </form>
  </section>

  <div class="barra-filtros">
    <div class="filtros">
      ${chip('Todos', sinFiltros, 'limpiar-filtros')}
      ${chip('Poco comunes', filtros.inusual, 'filtro-inusual')}
      ${conServicios.map((c) => chip(esc(c.nombre), filtros.categoriaId === c._id, 'filtro-categoria', c._id)).join('')}
      <select id="filtroModalidad" aria-label="Modalidad">
        <option value="">Cualquier modalidad</option>
        ${MODALIDADES.map(([v, t]) => `<option value="${v}" ${filtros.modalidad === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <span class="conteo">${resultados.length} servicio${resultados.length === 1 ? '' : 's'}${filtros.q ? ` para “${esc(filtros.q)}”` : ''}</span>
  </div>
  ${resultados.length
    ? `<div class="rejilla">${resultados.map(tarjetaServicio).join('')}</div>`
    : estado.servicios.length
      ? '<div class="vacio">No hay servicios que coincidan. La búsqueda usa palabras completas: prueba con otra palabra o quita filtros.</div>'
      : '<div class="vacio">Todavía no hay servicios publicados.<br><a class="boton oscuro" href="#publicar">Publicar el primero</a></div>'}`;
}

function verServicio(id) {
  const s = estado.servicios.find((x) => x._id === id);
  const ofertas = ofertasDe(id);
  const propio = sesion.usuario && (esAdmin() ||
    (esPrestador() && String(s.creadoPor || '') === sesion.usuario.id));
  const puedeSolicitar = sesion.usuario && (esCliente() || esAdmin());
  abrirModal(`
    <h2>${esc(s.nombre)}</h2>
    <p class="meta">${esc(s.categoria || s.categoriaId?.nombre || '')} · ${s.modalidades.map((m) => MODALIDADES.find(([v]) => v === m)?.[1]).join(', ')}</p>
    ${s.imagen ? `<img class="foto-detalle" src="${esc(s.imagen)}" alt="" onerror="this.remove()">` : ''}
    <p>${esc(s.descripcion)}</p>
    <div class="etiquetas">${s.etiquetas.map((e) => `<span>${esc(e)}</span>`).join('')}</div>
    <h3>Quién lo ofrece</h3>
    ${ofertas.length
      ? `<table>${ofertas.map(({ prestador: p, oferta: o }) => `<tr>
          <td><b>${esc(p.nombre)}</b><div class="meta">${esc(p.zonas.join(', '))}</div></td>
          <td class="derecha"><b>${dinero(o.tarifaBase)}</b> <span class="meta">/ ${esc(o.unidad)}</span></td></tr>`).join('')}</table>`
      : '<p class="meta">Todavía ningún prestador ofrece este servicio.</p>'}
    <div class="acciones" style="display:flex;align-items:center;margin-top:24px">
      ${propio ? `<button class="enlace peligro" data-accion="eliminar-servicio" data-id="${id}" style="margin-right:auto">Eliminar</button>
      <button class="boton" data-accion="editar-servicio" data-id="${id}">Editar</button>` : '<span style="margin-right:auto"></span>'}
      ${puedeSolicitar
        ? `<button class="boton oscuro" autofocus data-accion="solicitar" data-id="${id}">Solicitar</button>`
        : '<button class="boton oscuro" autofocus data-accion="abrir-sesion">Ingresar para solicitar</button>'}
    </div>`);
}

function solicitarServicio(id) {
  if (!sesion.usuario || !(esCliente() || esAdmin())) {
    return aviso('Ingresa como cliente para solicitar servicios', true);
  }
  const clienteId = sesion.usuario.id;
  if (!clienteId) return aviso('No se pudo identificar al cliente de la sesión', true);
  const s = estado.servicios.find((x) => x._id === id);
  const campos = [
    { nombre: 'descripcion', etiqueta: '¿Qué necesitas exactamente?', tipo: 'textarea', requerido: true, ancho: true },
    { nombre: 'modalidad', etiqueta: 'Modalidad', tipo: 'select', opciones: MODALIDADES.filter(([v]) => s.modalidades.includes(v)) },
    { nombre: 'zona', etiqueta: 'Zona o barrio' },
    { nombre: 'direccion', etiqueta: 'Dirección' },
    { nombre: 'fechaProgramada', etiqueta: 'Fecha deseada', tipo: 'datetime-local' },
  ];
  abrirFormulario(`Solicitar: ${s.nombre}`, campos, 'Crear orden', async (d) => {
    const ok = await ejecutar(
      () => api('/ordenes', 'POST', { ...d, fechaProgramada: d.fechaProgramada || undefined, clienteId, servicioId: id }),
      'Orden creada'
    );
    if (ok) location.hash = '#ordenes';
    return ok;
  }, `<p class="meta">Cliente: ${esc(nombreDe('usuarios', clienteId))}</p>`);
}

// ---------- Vista: Publicar ----------
const UNIDADES = [['servicio', 'Servicio completo'], ['hora', 'Hora'], ['dia', 'Día']];
const campoPrestador = () => ({
  nombre: 'prestadorId', etiqueta: 'Prestador', tipo: 'select', requerido: true,
  opciones: (esAdmin()
    ? estado.prestadores
    : estado.prestadores.filter((p) => p._id === sesion.usuario?.id)
  ).map((p) => [p._id, p.nombre]),
  valor: esPrestador() ? sesion.usuario.id : localStorage.getItem('prestadorActual'),
});
const camposOferta = () => [
  { nombre: 'tarifaBase', etiqueta: 'Precio', tipo: 'number', requerido: true },
  { nombre: 'unidad', etiqueta: 'Se cobra por', tipo: 'select', opciones: UNIDADES },
  { nombre: 'experienciaAnios', etiqueta: 'Años de experiencia', tipo: 'number', valor: 0 },
];

function vistaPublicar() {
  const cabecera = `<div class="encabezado"><div><h1>Publicar servicio</h1>
    <p>Tres pasos: quién lo ofrece, qué es y cuánto cuesta.</p></div></div>`;
  if (!sesion.usuario || !(esAdmin() || esPrestador())) {
    return `<section class="pagina estrecha">${cabecera}<div class="vacio">Ingresa como prestador o administrador para publicar.<br>
      <button class="boton oscuro" data-accion="abrir-sesion">Iniciar sesión</button></div></section>`;
  }
  if (!estado.prestadores.length) {
    return `<section class="pagina estrecha">${cabecera}<div class="vacio">Para publicar, primero regístrate como prestador.<br>
      <button class="boton oscuro" data-accion="nuevo-prestador">Registrarme como prestador</button></div></section>`;
  }
  const paso = (n, texto) => `<h2 class="paso-titulo"><span>${n}</span>${texto}</h2>`;
  return `<section class="pagina estrecha">${cabecera}
    <div class="panel" id="panelPublicar"><form class="formulario">
      ${paso(1, '¿Quién lo ofrece?')}
      ${campoHTML(campoPrestador())}
      <div class="campo"><span>¿No estás en la lista?</span><button type="button" class="boton" data-accion="nuevo-prestador">Registrar nuevo prestador</button></div>
      ${paso(2, '¿Qué ofreces?')}
      ${camposServicio().map(campoHTML).join('')}
      ${paso(3, '¿Cuánto cobras?')}
      ${camposOferta().map(campoHTML).join('')}
      <div class="acciones"><button class="boton oscuro">Publicar servicio</button></div>
    </form></div>
  </section>`;
}

async function publicar(form) {
  const campos = [campoPrestador(), ...camposServicio(), ...camposOferta()];
  const { prestadorId, tarifaBase, unidad, experienciaAnios, ...servicio } = leerFormulario(form, campos);
  localStorage.setItem('prestadorActual', prestadorId);
  const ok = await ejecutar(async () => {
    const creado = await api('/servicios', 'POST', datosServicio(servicio));
    const prestador = porId('prestadores', prestadorId);
    await api('/prestadores/' + prestadorId, 'PUT', {
      serviciosOfrecidos: [...prestador.serviciosOfrecidos, { servicioId: creado._id, tarifaBase, unidad, experienciaAnios }],
    });
  }, 'Servicio publicado');
  if (ok) location.hash = '#explorar';
}

// ---------- Vista: Prestadores ----------
const puedeEditarPrestador = (p) => Boolean(sesion.usuario && (
  esAdmin() || (esPrestador() && sesion.usuario.id === p._id)
));

function vistaPrestadores() {
  const filas = estado.prestadores.map((p) => { const editable = puedeEditarPrestador(p); return `
    <article class="tarjeta"><div class="tarjeta-cuerpo">
      <div class="panel-cabecera" style="margin-bottom:0">
        <div><h3>${esc(p.nombre)}</h3><div class="meta">${esc([p.ciudad, ...p.zonas].filter(Boolean).join(' · '))}</div></div>
        ${chipEstado(p.estado)}
      </div>
      ${p.descripcion ? `<p class="resumen">${esc(p.descripcion)}</p>` : ''}
      ${p.serviciosOfrecidos.length ? `<table class="lista-simple">${p.serviciosOfrecidos.map((o) => `<tr><td>${esc(nombreDe('servicios', o.servicioId))}</td>
        <td class="derecha"><b>${dinero(o.tarifaBase)}</b> <span class="meta">/ ${esc(o.unidad)}</span></td></tr>`).join('')}</table>` : '<p class="meta">Aún no ofrece servicios.</p>'}
      ${p.certificaciones.length ? `<div class="etiquetas">${p.certificaciones.map((c) => `<span>${esc(c.nombre || c.titulo)}${(c.vigente ?? c.verificada) ? ' ✓' : ''}</span>`).join('')}</div>` : ''}
      <div class="tarjeta-pie"><div class="fila-botones">
        ${editable ? `<button class="enlace" data-accion="ofrecer" data-id="${p._id}">+ Servicio</button>
        <button class="enlace" data-accion="certificar" data-id="${p._id}">+ Certificación</button>
        <button class="enlace" data-accion="editar-prestador" data-id="${p._id}">Editar</button>
      </div><button class="enlace peligro" data-accion="eliminar-prestador" data-id="${p._id}">Eliminar</button>` : ''}</div>
    </div></article>`; });
  return `<section class="pagina">
    <div class="encabezado"><div><h1>Prestadores</h1><p>Personas que ofrecen servicios, con sus zonas, tarifas y certificaciones.</p></div>
      <button class="boton oscuro" data-accion="nuevo-prestador">Registrar prestador</button></div>
    ${filas.length ? `<div class="rejilla ancha">${filas.join('')}</div>` : '<div class="vacio">Aún no hay prestadores.</div>'}
  </section>`;
}

function editarPrestador(id) {
  const p = id ? porId('prestadores', id) : {};
  const campos = camposPrestador(p);
  if (esAdmin()) campos.push({ nombre: 'estado', etiqueta: 'Estado', tipo: 'select', valor: p.estado, opciones: [['pendiente', 'Pendiente'], ['verificado', 'Verificado'], ['suspendido', 'Suspendido']] });
  const titulo = id ? 'Editar prestador' : (sesion.usuario ? 'Aplicar como prestador' : 'Registrar prestador');
  abrirFormulario(titulo, campos, 'Guardar', async (d) => {
    try {
      const respuesta = await api('/prestadores' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', {
        ...d,
        zonas: lista(d.zonas),
      });
      if (respuesta?.token && respuesta?.usuario) guardarSesion(respuesta);
      aviso('Prestador guardado');
      await cargarTodo();
      return true;
    } catch (error) {
      aviso(error.message, true);
      return false;
    }
  });
}

function ofrecerServicio(id) {
  const p = porId('prestadores', id);
  if (!estado.servicios.length) return aviso('Primero publica un servicio', true);
  abrirFormulario(`Nuevo servicio de ${p.nombre}`, [
    { nombre: 'servicioId', etiqueta: 'Servicio', tipo: 'select', opciones: opcionesServicio(), ancho: true },
    { nombre: 'tarifaBase', etiqueta: 'Tarifa', tipo: 'number', requerido: true },
    { nombre: 'unidad', etiqueta: 'Se cobra por', tipo: 'select', opciones: UNIDADES },
    { nombre: 'experienciaAnios', etiqueta: 'Años de experiencia', tipo: 'number', valor: 0 },
  ], 'Agregar', (d) => {
    const otros = p.serviciosOfrecidos.filter((o) => o.servicioId !== d.servicioId);
    return ejecutar(() => api('/prestadores/' + id, 'PUT', { serviciosOfrecidos: [...otros, d] }), 'Servicio agregado');
  });
}

function certificar(id) {
  abrirFormulario('Agregar certificación', [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, ancho: true },
    { nombre: 'institucion', etiqueta: 'Institución' },
    { nombre: 'fechaVencimiento', etiqueta: 'Vence', tipo: 'date' },
  ], 'Agregar', (d) =>
    ejecutar(() => api(`/prestadores/${id}/certificaciones`, 'POST', { ...d, fechaVencimiento: d.fechaVencimiento || undefined }), 'Certificación agregada'));
}

// ---------- Vista: Ordenes ----------
function puedeCambiarEstadoUI(o, estado) {
  const u = sesion.usuario;
  if (!u) return false;
  if (esAdmin()) return true;
  const permisos = [];
  if (esPrestador()) {
    permisos.push((o.estado === 'solicitada' && estado === 'cotizada') ||
      (String(o.prestador || o.prestadorId || '') === u.id && ['agendada', 'en_ejecucion', 'finalizada'].includes(estado)));
  }
  if (esCliente()) {
    permisos.push(String(o.cliente || o.clienteId) === u.id &&
      ['agendada', 'asignada', 'aceptada', 'pagada', 'calificada', 'cancelada', 'en_reclamo'].includes(estado));
  }
  return permisos.some(Boolean);
}

function vistaOrdenes() {
  const clienteId = esCliente() ? sesion.usuario.id : $('#clienteActual').value;
  const soloMias = localStorage.getItem('soloMias') === '1';
  const ordenes = estado.ordenes.filter((o) => !soloMias || String(o.cliente || o.clienteId) === clienteId);
  const filas = ordenes.map((o) => {
    const datos = [o.zona, o.direccion, o.fechaProgramada && fecha(o.fechaProgramada), o.precioAcordado != null && dinero(o.precioAcordado)].filter(Boolean);
    const permitidas = TRANSICIONES[o.estado].filter((e) => puedeCambiarEstadoUI(o, e));
    return `
    <div class="panel">
      <div class="panel-cabecera">
        <div>
          <h2>${esc(nombreDe('servicios', o.servicioId))}</h2>
          <div class="meta">${esc(nombreDe('usuarios', o.cliente || o.clienteId))} → ${(o.prestador || o.prestadorId) ? esc(nombreDe('prestadores', o.prestador || o.prestadorId)) : 'sin prestador asignado'}</div>
        </div>
        ${chipEstado(o.estado)}
      </div>
      <p>${esc(o.descripcion)}</p>
      ${o.snapshot ? `<p class="meta">Snapshot: ${esc(o.snapshot.nombreCliente || '')} · ${esc(o.snapshot.nombreServicio || '')} · ${esc(o.snapshot.categoria || '')}${o.snapshot.tarifa != null ? ' · ' + dinero(o.snapshot.tarifa) : ''}</p>` : ''}
      ${o.cancelacion ? `<p class="meta">Cancelación: ${esc(o.cancelacion.quien)} · ${esc(o.cancelacion.razon || '')}${o.cancelacion.penalizacion ? ' · penalización ' + dinero(o.cancelacion.penalizacion) : ''}</p>` : ''}
      ${o.calificacion ? `<p class="meta">Calificación: ${esc(o.calificacion.puntaje)}/5 ${esc(o.calificacion.comentario || '')}</p>` : ''}
      ${datos.length ? `<p class="meta">${datos.map(esc).join(' · ')}</p>` : ''}
      <ul class="historial">${o.historialEstados.map((h) => `<li><b>${esc(textoEstado(h.estado))}</b> · ${fecha(h.fecha)} · ${esc(h.actor.tipo)}${h.nota ? ' · ' + esc(h.nota) : ''}</li>`).join('')}</ul>
      ${SIGUIENTE[o.estado] ? `<p class="pista"><b>Siguiente paso:</b> ${SIGUIENTE[o.estado]}</p>` : ''}
      ${permitidas.length ? `<div class="fila-botones" style="margin-top:14px">
        ${permitidas.map((e) => e === 'cancelada' || e === 'en_reclamo'
          ? `<button class="enlace peligro" data-accion="cambiar-estado" data-id="${o._id}" data-valor="${e}">${ACCION[e]}</button>`
          : `<button class="boton mini oscuro" data-accion="cambiar-estado" data-id="${o._id}" data-valor="${e}">${ACCION[e]}</button>`).join('')}
      </div>` : ''}
    </div>`;
  });
  return `<section class="pagina">
    <div class="encabezado"><div><h1>Órdenes</h1><p>Cada cambio de estado queda en el historial con fecha y actor.</p></div>
      <button class="chip ${soloMias ? 'activo' : ''}" data-accion="solo-mias">Solo las del cliente actual</button></div>
    ${filas.length ? filas.join('') : '<div class="vacio">No hay órdenes. Crea una desde <a href="#explorar"><u>Explorar</u></a>: abre un servicio y pulsa Solicitar.</div>'}
  </section>`;
}

function cambiarEstado(id, nuevo) {
  const o = porId('ordenes', id);
  const campos = [];
  if (nuevo === 'cotizada') campos.push({ nombre: 'precioAcordado', etiqueta: 'Precio cotizado', tipo: 'number', requerido: true });
  if (nuevo === 'asignada' || nuevo === 'aceptada') {
    const candidatos = ofertasDe(o.servicioId).map((x) => x.prestador);
    const opciones = (candidatos.length ? candidatos : estado.prestadores).map((p) => [p._id, p.nombre]);
    campos.push({ nombre: 'prestador', etiqueta: 'Prestador asignado', tipo: 'select', requerido: true, opciones });
  }
  if (nuevo === 'agendada') campos.push({ nombre: 'fechaProgramada', etiqueta: 'Fecha acordada', tipo: 'datetime-local', valor: o.fechaProgramada ? o.fechaProgramada.slice(0, 16) : '' });
  campos.push({ nombre: 'nota', etiqueta: 'Nota (opcional)', ancho: true });

  abrirFormulario(ACCION[nuevo], campos, 'Confirmar', ({ nota, ...resto }) => {
    const cuerpo = { estado: nuevo, nota: nota || undefined, ...resto };
    if (!cuerpo.fechaProgramada) delete cuerpo.fechaProgramada;
    return ejecutar(() => api(`/ordenes/${id}/estado`, 'PATCH', cuerpo), 'Estado actualizado');
  });
}

// ---------- Vista: Gestion ----------
function vistaGestion() {
  if (!esAdmin()) {
    return '<section class="pagina"><div class="vacio">Esta sección es solo para administradores.</div></section>';
  }
  const tabla = (titulo, tipo, columnas, filas) => `
    <div class="panel">
      <div class="panel-cabecera"><h2>${titulo}</h2>
        ${tipo === 'usuario' ? '<button class="boton mini" data-accion="nuevo-usuario">Nuevo</button>' : '<span class="meta">Se crean al publicar un servicio</span>'}</div>
      ${filas.length ? `<table><tr>${columnas.map((c) => `<th>${c}</th>`).join('')}<th></th></tr>${filas.join('')}</table>` : '<p class="meta">Sin registros.</p>'}
    </div>`;
  const botones = (tipo, id) => `<td class="derecha">
    <button class="enlace" data-accion="editar-${tipo}" data-id="${id}">Editar</button>
    <button class="enlace peligro" data-accion="eliminar-${tipo}" data-id="${id}">Eliminar</button></td>`;
  return `<section class="pagina">
    <div class="encabezado"><div><h1>Gestión</h1><p>Clientes de la plataforma y limpieza de categorías.</p></div></div>
    <div class="dos-columnas">
      ${tabla('Clientes', 'usuario', ['Nombre', 'Ciudad'], estado.usuarios.map((u) =>
        `<tr><td><b>${esc(u.nombre)}</b><div class="meta">${esc(u.email)}</div></td><td>${esc(u.ciudad || '')}</td>${botones('usuario', u._id)}</tr>`))}
      ${tabla('Categorías', 'categoria', ['Nombre', 'Servicios'], estado.categorias.map((c) =>
        `<tr><td><b>${esc(c.nombre)}</b><div class="meta">${esc(c.descripcion || '')}</div></td>
         <td>${estado.servicios.filter((s) => s.categoriaId?._id === c._id).length}</td>${botones('categoria', c._id)}</tr>`))}
    </div>
  </section>`;
}

const RECURSOS = {
  usuario: { ruta: '/usuarios', coleccion: 'usuarios', campos: camposUsuario, nombre: 'Cliente' },
  categoria: { ruta: '/categorias', coleccion: 'categorias', campos: camposCategoria, nombre: 'Categoría' },
};
function editarRecurso(tipo, id) {
  const r = RECURSOS[tipo];
  abrirFormulario((id ? 'Editar ' : 'Nuevo: ') + r.nombre.toLowerCase(), r.campos(id ? porId(r.coleccion, id) : {}), 'Guardar', (d) =>
    ejecutar(() => api(r.ruta + (id ? '/' + id : ''), id ? 'PUT' : 'POST', d), r.nombre + ' guardado'));
}
function eliminar(ruta, id, nombre) {
  if (!confirm(`¿Eliminar “${nombre}”?`)) return;
  $('#modal').close();
  ejecutar(() => api(`${ruta}/${id}`, 'DELETE'), 'Eliminado');
}

// ---------- Navegacion y eventos ----------
const VISTAS = { explorar: vistaExplorar, publicar: vistaPublicar, prestadores: vistaPrestadores, ordenes: vistaOrdenes, gestion: vistaGestion };

function pintar() {
  const nombre = VISTAS[location.hash.slice(1)] ? location.hash.slice(1) : 'explorar';
  $('#vista').innerHTML = VISTAS[nombre]();
  aplicarSesion();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('activa', a.getAttribute('href') === '#' + nombre));

  if (nombre === 'publicar' && $('#panelPublicar form')) {
    $('#panelPublicar form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      publicar(ev.target);
    });
  }
}

window.addEventListener('hashchange', () => { pintar(); window.scrollTo(0, 0); });

document.addEventListener('submit', (ev) => {
  if (ev.target.id === 'formSesion') {
    ev.preventDefault();
    enviarSesion(ev.target);
    return;
  }
  if (ev.target.id !== 'formBuscar') return;
  ev.preventDefault();
  filtros.q = ev.target.elements.q.value.trim();
  buscar().catch((e) => aviso(e.message, true));
});

document.addEventListener('change', (ev) => {
  if (ev.target.name === 'prestadorId') localStorage.setItem('prestadorActual', ev.target.value);
  if (ev.target.matches('[data-subir]')) subirImagen(ev.target);
  if (ev.target.name === 'imagen') mostrarVistaPrevia(ev.target.closest('.subir-imagen'), ev.target.value.trim());
  if (ev.target.id === 'filtroModalidad') {
    filtros.modalidad = ev.target.value;
    buscar().catch((e) => aviso(e.message, true));
  }
  if (ev.target.id === 'clienteActual') {
    localStorage.setItem('clienteActual', ev.target.value);
    pintar();
  }
});

document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-cerrar]') || ev.target.id === 'modal') return $('#modal').close();
  const boton = ev.target.closest('[data-accion]');
  if (!boton) return;
  const { accion, id, valor } = boton.dataset;
  const servicio = () => estado.servicios.find((s) => s._id === id);

  const acciones = {
    'limpiar-filtros': () => { Object.assign(filtros, { q: '', inusual: false, modalidad: '', categoriaId: '' }); buscar(); },
    'filtro-inusual': () => { filtros.inusual = !filtros.inusual; buscar(); },
    'filtro-categoria': () => { filtros.categoriaId = filtros.categoriaId === valor ? '' : valor; buscar(); },
    'ver-servicio': () => verServicio(id),
    solicitar: () => solicitarServicio(id),
    sesion: () => (sesion.usuario ? cerrarSesion() : abrirSesion()),
    'abrir-sesion': () => abrirSesion(),
    'modo-login': () => abrirSesion('login'),
    'modo-registro': () => abrirSesion('registro'),
    'editar-servicio': () => abrirFormulario('Editar servicio', camposServicio(servicio()), 'Guardar', (d) =>
      ejecutar(() => api('/servicios/' + id, 'PUT', datosServicio(d)), 'Servicio actualizado')),
    'eliminar-servicio': () => eliminar('/servicios', id, servicio().nombre),
    'nuevo-prestador': () => (sesion.usuario ? editarPrestador() : abrirSesion('registro')),
    'editar-prestador': () => editarPrestador(id),
    'eliminar-prestador': () => eliminar('/prestadores', id, nombreDe('prestadores', id)),
    ofrecer: () => ofrecerServicio(id),
    certificar: () => certificar(id),
    'cambiar-estado': () => cambiarEstado(id, valor),
    'solo-mias': () => { localStorage.setItem('soloMias', localStorage.getItem('soloMias') === '1' ? '0' : '1'); pintar(); },
    'nuevo-usuario': () => editarRecurso('usuario'),
    'editar-usuario': () => editarRecurso('usuario', id),
    'eliminar-usuario': () => eliminar('/usuarios', id, nombreDe('usuarios', id)),
    'nuevo-categoria': () => editarRecurso('categoria'),
    'editar-categoria': () => editarRecurso('categoria', id),
    'eliminar-categoria': () => eliminar('/categorias', id, nombreDe('categorias', id)),
  };
  acciones[accion]?.();
});

// ---------- Inicio ----------
(async () => {
  try {
    aplicarSesion();
    await api('/health');
    await cargarTodo();
  } catch (error) {
    $('#vista').innerHTML = `<div class="vacio" style="margin:40px 0">No se pudo cargar la información: ${esc(error.message)}</div>`;
  }
})();
