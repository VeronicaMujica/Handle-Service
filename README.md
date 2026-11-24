# Handle Service

Plataforma para contratar servicios comunes y poco comunes. API REST con Node.js, Express y MongoDB (Mongoose), mas una interfaz web sin frameworks.

## Requisitos

- Node.js 20 o superior
- MongoDB: instalado localmente, en Docker (`docker compose up -d`) o en MongoDB Atlas

## Puesta en marcha

```
npm install
copy .env.example .env      (ajustar MONGODB_URI si usan Atlas)
npm run seed                (carga datos de ejemplo; borra los anteriores)
npm run dev                 (servidor en http://localhost:3000)
npm test                    (pruebas de autenticación y roles, con MongoDB en memoria)
```

La interfaz web queda en http://localhost:3000 y la API en http://localhost:3000/api.

## Inicio de sesión y roles

Las contraseñas se guardan con `scrypt` (sal aleatoria por usuario) y nunca se devuelven en las
respuestas. El inicio de sesión entrega un JWT que se envía en cada petición protegida como
`Authorization: Bearer <token>`. El secreto se configura en `JWT_SECRET` (ver `.env.example`).

Cada usuario tiene `roles` (`cliente`, `prestador` y/o `administrador`). Una misma persona puede ser
cliente y prestador a la vez: el perfil de prestador vive en `perfilPrestador` dentro del usuario y
no existe la colección `prestadores`. Las rutas `/api/prestadores` son una vista sobre esos usuarios.
Se aceptan además los nombres anteriores (`usuario`, `admin`) y el campo `rol` singular.

| Rol (`roles`) | Alias | Permisos principales |
|---|---|---|
| `cliente` | `usuario` | Crea órdenes, edita su propio perfil, ve sus órdenes y puede aceptar/asignar, agendar, pagar, calificar, cancelar o abrir reclamos. |
| `prestador` | `prestador` | Publica servicios, edita su perfil, oferta servicios y certificaciones, cotiza órdenes solicitadas y gestiona las que tiene asignadas. |
| `administrador` | `admin` | Acceso total: categorías, servicios, usuarios, prestadores y órdenes. |

Cuentas del `seed` (contraseña = misma palabra con `12345`):

- `admin@example.com` / `admin12345`
- `ana.gomez@example.com` / `ana12345`
- `marta.rios@example.com` / `marta12345`
- `joao.pereira@example.com` / `joao12345`

También se puede crear una cuenta desde la interfaz (botón **Ingresar** → **Regístrate**) o con
`POST /api/auth/registro` indicando `roles: ["cliente"]` o `roles: ["prestador"]` (también se acepta
`rol: "usuario"` o `rol: "prestador"`). El campo `rol` singular se conserva como alias calculado.

Una cuenta recién creada como cliente puede aplicar a prestador sin registrarse de nuevo:
`POST /api/prestadores` acepta el `Authorization: Bearer <token>` y añade `prestador` a los `roles`
**del mismo usuario**, con `perfilPrestador.estado = "pendiente"`. La respuesta incluye un `token`
y un `usuario` actualizados para refrescar la sesión; el usuario conserva `cliente`, así que puede
seguir solicitando servicios. Un usuario normal no puede indicar el correo de otra cuenta (409) y
solo puede aplicar una vez. Sin token sigue el alta pública de siempre; un administrador sí puede
crear prestadores con cuentas separadas enviando otro `email`.

## Colecciones

Los campos nuevos son canónicos; los alias anteriores siguen aceptándose en entradas y salidas para
no romper clientes existentes (`activa` ↔ `estado`, `esInusual` ↔ `inusual`, `categoriaId` ↔
`categoria`, `*Id` ↔ `cliente`/`servicio`/`prestador`, `serviciosOfrecidos` ↔ `perfilPrestador.servicios`).

| Colección | Campos |
|---|---|
| `categorias` | `_id`, `nombre` (único), `descripcion`, `estado` (`activo`/`inactivo`). RF-05: no se elimina si hay servicios que la referencian. |
| `servicios` | `_id`, `nombre`, `descripcion`, `categoria` (nombre), `etiquetas`, `modalidades` (`domicilio`/`remoto`/`local`), `inusual`, `estado` (`activo`/`retirado`). Búsqueda de texto sobre nombre, descripción, etiquetas y categoría (RF-03/RF-04). |
| `usuarios` | `_id`, `nombre`, `email` (único), `passwordHash`, `roles[]`, `estado` (`activo`/`suspendido`/`bloqueado`), `direcciones[]`, `ciudad`, `zona`, `caracterizacion`, `idiomas[]`, `habilidades[]` y `perfilPrestador` opcional. |
| `perfilPrestador` (embebido) | `documento`, `zonasCobertura[]`, `modalidades[]`, `servicios[]` (`_id`, `nombre`, `categoria`, `tarifa`), `certificaciones[]` (`nombre`, `institucion`, `fechaEmision`, `fechaVencimiento`, `vigente` — RF-32), `calificacion` (`promedio`, `total`). |
| `ordenes` | `_id`, `cliente`, `servicio`, `prestador`, `estado`, `snapshot` (nombreCliente, nombrePrestador, nombreServicio, categoria, modalidad, zona, tarifa, inusual, descripcionSolicitud, fechaSolicitud), `cancelacion` (quien, fecha, razon, penalizacion), `calificacion` (puntaje, comentario, fecha). |

El flujo completo de la orden (cotizada, asignada/aceptada, agendada, en ejecución, finalizada,
pagada, calificada, cancelada, en reclamo) se conserva; `snapshot` congela los datos de la
contratación y no se reescribe cuando cambia el catálogo.

## Estructura

```
handle-service/
├── docs/
│   └── requests.http        peticiones de prueba de la API (REST Client o Postman)
├── public/                  interfaz web
│   ├── index.html
│   ├── css/styles.css
│   ├── js/app.js
│   ├── img/                 logo y banner
│   └── uploads/             fotos subidas por los usuarios
├── src/                     backend
│   ├── server.js            arranque: conecta a MongoDB y levanta Express
│   ├── app.js               configuracion de Express
│   ├── config/db.js         conexion a MongoDB
│   │   └── auth.js          firma y verificacion del JWT
│   ├── models/              esquemas de Mongoose (prestadores = vista de usuarios)
│   ├── controllers/         logica de cada endpoint
│   ├── routes/              rutas por recurso; index.js las agrupa bajo /api
│   ├── middlewares/         autenticacion, autorizacion y manejo de errores
│   ├── utils/password.js    hash scrypt y verificacion de contraseñas
│   └── seed/seed.js         datos de ejemplo
├── test/                    pruebas de autenticación y roles
├── .env.example
├── docker-compose.yml
└── package.json
```

## Endpoints

| Recurso | Rutas |
|---|---|
| Autenticación | `POST /api/auth/registro` · `POST /api/auth/login` · `GET /api/auth/yo` |
| Salud | `GET /api/health` |
| Categorias | `GET, POST /api/categorias` · `GET, PUT, DELETE /api/categorias/:id` · filtros `estado`, `activa` |
| Servicios | `GET, POST /api/servicios` · `GET, PUT, DELETE /api/servicios/:id` · filtros `q`, `categoria`, `categoriaId`, `inusual`, `modalidad`, `estado` |
| Prestadores (vista) | `GET, POST /api/prestadores` (el `POST` acepta token para aplicar desde la cuenta actual) · `GET, PUT, DELETE /api/prestadores/:id` · `POST /api/prestadores/:id/certificaciones` · filtros `servicio`, `servicioId`, `zona`, `estado` |
| Usuarios | `GET, POST /api/usuarios` · `GET, PUT, DELETE /api/usuarios/:id` · filtros `roles`, `ciudad`, `zona`, `estado` |
| Ordenes | `GET, POST /api/ordenes` · `GET /api/ordenes/:id` · `PATCH /api/ordenes/:id/estado` · acepta `cliente`/`servicio`/`prestador` y `snapshot`, `cancelacion`, `calificacion` |
| Imagenes | `POST /api/imagenes` |
| Reportes | `GET /api/reportes/ranking-prestadores` (solo admin) |

## Reporte RP-02

Ranking de prestadores por `perfilPrestador.calificacion.promedio` y número de órdenes completadas
(`finalizada`, `pagada` y `calificada`). La agregación parte de `usuarios`, filtra los que tienen
`perfilPrestador` y hace `$lookup` a `ordenes` por `prestador`/`prestadorId`. La respuesta mantiene
`calificacionPromedio`, `totalCalificaciones`, `zonas` y `serviciosOfrecidos` como alias.

Filtros disponibles: `?zona=Chapinero&estado=verificado&minCalificacion=4&limite=10`.
