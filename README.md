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

| Rol | Permisos principales |
|---|---|
| `usuario` | Crea órdenes, edita su propio perfil, ve sus órdenes y puede aceptar/asignar, agendar, pagar, calificar, cancelar o abrir reclamos. |
| `prestador` | Publica servicios, edita su perfil, oferta servicios y certificaciones, cotiza órdenes solicitadas y gestiona las que tiene asignadas. |
| `admin` | Acceso total: categorías, servicios, usuarios, prestadores y órdenes. |

Cuentas del `seed` (contraseña = misma palabra con `12345`):

- `admin@example.com` / `admin12345`
- `ana.gomez@example.com` / `ana12345`
- `marta.rios@example.com` / `marta12345`
- `joao.pereira@example.com` / `joao12345`

También se puede crear una cuenta desde la interfaz (botón **Ingresar** → **Regístrate**) o con
`POST /api/auth/registro` indicando `rol: "usuario"` o `rol: "prestador"`.

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
│   ├── models/              esquemas de Mongoose, uno por coleccion
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
| Categorias | `GET, POST /api/categorias` · `GET, PUT, DELETE /api/categorias/:id` |
| Servicios | `GET, POST /api/servicios` · `GET, PUT, DELETE /api/servicios/:id` · filtros `q`, `categoriaId`, `inusual`, `modalidad` |
| Prestadores | `GET, POST /api/prestadores` · `GET, PUT, DELETE /api/prestadores/:id` · `POST /api/prestadores/:id/certificaciones` · filtros `servicioId`, `zona`, `estado` |
| Usuarios | `GET, POST /api/usuarios` · `GET, PUT, DELETE /api/usuarios/:id` |
| Ordenes | `GET, POST /api/ordenes` · `GET /api/ordenes/:id` · `PATCH /api/ordenes/:id/estado` |
| Imagenes | `POST /api/imagenes` |
| Reportes | `GET /api/reportes/ranking-prestadores` (solo admin) |

## Reporte RP-02

Ranking de prestadores por `calificacionPromedio` y número de órdenes completadas
(`finalizada`, `pagada` y `calificada`). Se calcula con el framework de agregación:

1. `$match` opcional por `zona`, `estado` y `minCalificacion`.
2. `$lookup` a `ordenes` con `$expr` para traer solo las órdenes completadas del prestador.
3. `$addFields`/`$unset` para convertir el conteo en `ordenesCompletadas`.
4. `$sort` por calificación, órdenes completadas y nombre; `$limit` y `$project`.

Filtros disponibles: `?zona=Chapinero&estado=verificado&minCalificacion=4&limite=10`.
