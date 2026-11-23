# E-Commerce Platform (microservicios)

Plataforma de comercio electrónico escalable basada en microservicios y Docker. Cada funcionalidad (catálogo, usuarios, carrito, pagos, pedidos…) vive en su propio servicio, que se desarrolla, despliega y escala de forma independiente.

Esta primera iteración (MVP) incluye los dos primeros servicios:

| Servicio | Responsabilidad | Puerto | Base de datos |
|---|---|---|---|
| **User Service** | Registro, autenticación (JWT) y gestión de perfil | `3001` | SQLite `users.db` |
| **Product Catalog Service** | Productos, categorías e inventario | `3002` | SQLite `catalog.db` |

El resto de servicios y componentes están en la sección [Pendiente](#pendiente).

## Arquitectura

```
                 cliente (curl / frontend)
                    │               │
          :3001     ▼               ▼     :3002
        ┌──────────────────┐   ┌────────────────────────────┐
        │   user-service   │   │  product-catalog-service   │
        │ emite JWT (HS256)│   │ verifica JWT (mismo secreto)│
        └────────┬─────────┘   └─────────────┬──────────────┘
                 │                           │
           ┌─────▼─────┐               ┌─────▼──────┐
           │ users.db  │               │ catalog.db │
           │ (SQLite)  │               │ (SQLite)   │
           └───────────┘               └────────────┘
          volumen user-data       volumen catalog-data
```

- **Un microservicio, una base de datos.** Cada servicio es dueño de su archivo SQLite, guardado en su propio volumen de Docker, y no accede a la base del otro. El esquema se crea automáticamente al arrancar.
- **Autenticación sin estado.** `user-service` firma un JWT con `sub` (id del usuario) y `role`. `product-catalog-service` solo lo verifica con el secreto compartido `JWT_SECRET`, sin llamar a `user-service`.
- **Roles.** `customer` (por defecto al registrarse) y `admin`. Las lecturas del catálogo son públicas; las escrituras (productos, categorías, inventario) requieren `admin`.
- **Logs en JSON por stdout** (`pino-http`), listos para enviarse a un stack de logging centralizado.
- Cada servicio expone `GET /health` (lo usa el `HEALTHCHECK` del contenedor).

### Stack

Node.js 24 · Express 5 · SQLite con el módulo nativo `node:sqlite` (sin dependencias nativas ni ORM) · JWT (`jsonwebtoken`) · `bcryptjs` · validación con `zod` · tests con `node:test` + `supertest` · Docker y Docker Compose.

### Suposiciones tomadas

- **SQLite** como base de datos de ambos servicios: cero infraestructura extra y suficiente para el MVP. Se usa en modo WAL y con claves foráneas activas. Como SQLite es un archivo local, cada servicio debe correr con **una sola réplica**; para escalar horizontalmente habrá que migrar a un servidor de base de datos (p. ej. PostgreSQL), servicio por servicio.
- **Ids numéricos** autoincrementales (`INTEGER PRIMARY KEY`).
- **JWT HS256 con secreto compartido** entre servicios. En producción conviene pasar a RS256 (clave privada solo en `user-service`, pública en el resto) o validar el token en el API Gateway.
- **Admin inicial** creado al arrancar `user-service` a partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`. No existe endpoint público para registrarse como admin; un admin puede promover a otros usuarios.
- **Inventario** guardado como campo `stock` del producto (sin almacenes ni reservas). El ajuste de stock es atómico y nunca deja valores negativos.
- No hay refresh tokens ni recuperación de contraseña en este MVP.

## Cómo levantarlo

Requisitos: Docker y Docker Compose v2.

```bash
cp .env.example .env
```

```bash
docker compose up -d --build
```

```bash
docker compose ps
```

Servicios disponibles en `http://localhost:3001` (usuarios) y `http://localhost:3002` (catálogo). Para pararlo:

```bash
docker compose down
```

Añade `-v` a `down` para borrar también los volúmenes de datos.

### Desarrollo local sin Docker

Requiere Node.js 22.13 o superior (por `node:sqlite`). No hace falta instalar ninguna base de datos: cada servicio crea su archivo en `./data/` (configurable con `DB_PATH`).

```bash
cd services/user-service && npm install && npm run dev
```

### Tests

Cada servicio tiene sus tests de integración; usan una base SQLite en memoria, así que no necesitan Docker.

```bash
cd services/user-service && npm install && npm test
```

```bash
cd services/product-catalog-service && npm install && npm test
```

## Endpoints

Todas las respuestas son JSON. Los errores tienen la forma `{ "error": "...", "details": [...] }`.
🔒 = requiere `Authorization: Bearer <token>`; 👑 = requiere rol `admin`.

### User Service (`:3001`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | | Estado del servicio y de la base de datos |
| POST | `/api/auth/register` | | Registro `{ email, password, name, phone? }` → `{ user, token }` |
| POST | `/api/auth/login` | | Login `{ email, password }` → `{ user, token }` |
| GET | `/api/users/me` | 🔒 | Perfil del usuario autenticado |
| PATCH | `/api/users/me` | 🔒 | Actualiza `{ name?, phone?, address? }` |
| PUT | `/api/users/me/password` | 🔒 | Cambia contraseña `{ currentPassword, newPassword }` |
| DELETE | `/api/users/me` | 🔒 | Elimina la propia cuenta |
| GET | `/api/users?page&limit` | 👑 | Lista paginada de usuarios |
| GET | `/api/users/:id` | 👑 | Detalle de un usuario |
| PATCH | `/api/users/:id/role` | 👑 | Cambia el rol `{ role: "customer" \| "admin" }` |

### Product Catalog Service (`:3002`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | | Estado del servicio y de la base de datos |
| GET | `/api/categories` | | Lista de categorías |
| GET | `/api/categories/:idOrSlug` | | Detalle por id o slug |
| POST | `/api/categories` | 👑 | Crea `{ name, description? }` (el slug se genera solo) |
| PATCH | `/api/categories/:idOrSlug` | 👑 | Actualiza una categoría |
| DELETE | `/api/categories/:idOrSlug` | 👑 | Elimina (409 si tiene productos) |
| GET | `/api/products` | | Lista de productos activos (ver filtros) |
| GET | `/api/products/:id` | | Detalle de un producto |
| POST | `/api/products` | 👑 | Crea `{ name, sku, price, description?, currency?, category?, images?, stock?, isActive? }` (`category` es el id numérico) |
| PATCH | `/api/products/:id` | 👑 | Actualiza un producto |
| DELETE | `/api/products/:id` | 👑 | Elimina un producto |
| GET | `/api/products/:id/inventory` | | `{ productId, sku, stock, inStock }` |
| PUT | `/api/products/:id/inventory` | 👑 | Fija el stock `{ stock }` |
| POST | `/api/products/:id/inventory/adjust` | 👑 | Ajuste atómico `{ delta }` (positivo entra, negativo sale; 409 si no hay stock suficiente) |

Filtros de `GET /api/products`: `q` (búsqueda de texto en nombre y descripción), `category` (id o slug), `minPrice`, `maxPrice`, `inStock=true|false`, `sort` (`price`, `-price`, `name`, `-name`, `createdAt`, `-createdAt`; por defecto `-createdAt`), `page`, `limit` (máx. 100). Respuesta: `{ items, page, limit, total }`.

### Ejemplo rápido

Login como admin (credenciales del `.env`) y guardar el token:

```bash
TOKEN=$(curl -s -X POST localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@shop.local","password":"admin12345"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
```

Crear una categoría y un producto:

```bash
curl -s -X POST localhost:3002/api/categories -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Periféricos"}'
```

```bash
curl -s -X POST localhost:3002/api/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Teclado mecánico","sku":"KB-001","price":79.9,"stock":10}'
```

Consultar el catálogo (público):

```bash
curl -s 'localhost:3002/api/products?q=teclado&inStock=true'
```

## Estructura

```
.
├── docker-compose.yml
├── .env.example
└── services/
    ├── user-service/
    │   ├── Dockerfile
    │   ├── src/ (app.js, server.js, config.js, models/, routes/, middleware/)
    │   └── test/
    └── product-catalog-service/
        ├── Dockerfile
        ├── src/ (app.js, server.js, config.js, models/, routes/, middleware/)
        └── test/
```

## Pendiente

### Microservicios

- [ ] **Shopping Cart Service**: carrito por usuario; añadir/quitar productos y cambiar cantidades. Consultará precio y stock al Product Catalog Service. Candidato natural a Redis.
- [ ] **Order Service**: crear pedidos a partir del carrito, seguimiento de estado e historial. Usará `POST /api/products/:id/inventory/adjust` para descontar stock (habrá que añadir reservas y compensación si el pago falla, p. ej. patrón Saga).
- [ ] **Payment Service**: integración con pasarelas externas (Stripe, PayPal) y webhooks de confirmación.
- [ ] **Notification Service**: emails y SMS (SendGrid, Twilio) ante eventos como confirmación de pedido o envío; idealmente consumiendo eventos de una cola (RabbitMQ/Kafka).

### Componentes de infraestructura

- [ ] **API Gateway** (Kong, Traefik o NGINX): punto de entrada único, enrutado a cada servicio, validación de JWT centralizada, rate limiting y CORS.
- [ ] **Service Discovery** (Consul o Eureka): registro y descubrimiento dinámico de instancias. Ahora se usa el DNS interno de Docker Compose.
- [ ] **Logging centralizado (ELK)**: Elasticsearch, Logstash/Filebeat y Kibana. Los servicios ya escriben logs JSON por stdout.
- [ ] **Monitoreo (Prometheus + Grafana)**: exponer `/metrics` en cada servicio (p. ej. `prom-client`) y dashboards.
- [ ] **Despliegue en Docker Swarm o Kubernetes**: réplicas, auto-escalado y balanceo de carga.
- [ ] **CI/CD** (GitHub Actions, GitLab CI o Jenkins): tests, build y publicación de imágenes por servicio, y despliegue automático.

### Mejoras de los servicios actuales

- [ ] Migrar de SQLite a un servidor de base de datos (p. ej. PostgreSQL) antes de ejecutar varias réplicas por servicio.
- [ ] Refresh tokens, cierre de sesión y recuperación de contraseña.
- [ ] Firma JWT asimétrica (RS256/JWKS) en lugar de secreto compartido.
- [ ] Documentación OpenAPI/Swagger.
- [ ] Reservas de inventario con expiración y almacenes múltiples.
- [ ] Subida de imágenes de producto a almacenamiento de objetos (S3 o similar).

## Licencia

Distribuido bajo la licencia MIT. Consulta [LICENSE](LICENSE).
