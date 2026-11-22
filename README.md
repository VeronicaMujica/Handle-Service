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
```

La interfaz web queda en http://localhost:3000 y la API en http://localhost:3000/api.

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
│   ├── models/              esquemas de Mongoose, uno por coleccion
│   ├── controllers/         logica de cada endpoint
│   ├── routes/              rutas por recurso; index.js las agrupa bajo /api
│   ├── middlewares/         manejo centralizado de errores
│   └── seed/seed.js         datos de ejemplo
├── .env.example
├── docker-compose.yml
└── package.json
```

## Endpoints

| Recurso | Rutas |
|---|---|
| Salud | `GET /api/health` |
| Categorias | `GET, POST /api/categorias` · `GET, PUT, DELETE /api/categorias/:id` |
| Servicios | `GET, POST /api/servicios` · `GET, PUT, DELETE /api/servicios/:id` · filtros `q`, `categoriaId`, `inusual`, `modalidad` |
| Prestadores | `GET, POST /api/prestadores` · `GET, PUT, DELETE /api/prestadores/:id` · `POST /api/prestadores/:id/certificaciones` · filtros `servicioId`, `zona`, `estado` |
| Usuarios | `GET, POST /api/usuarios` · `GET, PUT, DELETE /api/usuarios/:id` |
| Ordenes | `GET, POST /api/ordenes` · `GET /api/ordenes/:id` · `PATCH /api/ordenes/:id/estado` |
| Imagenes | `POST /api/imagenes` |
