# Lumière Backend

NestJS + TypeScript + MongoDB (Mongoose) + JWT (access + refresh) API powering the
Lumière storefront in `../ecommerce`.

## Stack

- **NestJS 10** with TypeScript
- **MongoDB Atlas** via **Mongoose**
- **JWT** access + refresh tokens (Passport JWT strategy)
- **class-validator** DTO validation
- **helmet**, **compression**, **throttler** for hardening
- **bcryptjs** for password hashing

## Quick start

```bash
cd backend
cp .env.example .env       # fill in MONGODB_URI + JWT secrets

npm install
npm run start:dev          # http://localhost:4000
```

Seed the database with the same catalog the storefront ships with:

```bash
npm run seed
```

## Roles

| Role       | What they can do                                                             |
|------------|------------------------------------------------------------------------------|
| `admin`    | Everything: manage users, all products, all orders.                          |
| `vendor`   | Create / edit / delete **their own** products. List `/products/mine`.        |
| `customer` | Default: shop, place orders, manage own profile / orders / wishlist.         |

Enforcement: `JwtAuthGuard` runs globally and populates `req.user`; `RolesGuard`
then reads the `@Roles(...)` metadata on the handler/class. Mark public routes
with `@Public()` to bypass both.

## API surface

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Liveness check |
| POST | `/auth/register` | Public | Create account → access + refresh tokens |
| POST | `/auth/login` | Public | Sign in → access + refresh tokens |
| POST | `/auth/refresh` | Refresh JWT | Rotate refresh + issue new access |
| POST | `/auth/logout` | Any | Revoke refresh on the server |
| GET | `/auth/me` | Any | Current user profile |
| GET | `/products` | Public | List products with filters/sort/pagination |
| GET | `/products/mine` | vendor, admin | Vendor's own products |
| GET | `/products/:slug` | Public | Single product by slug |
| POST | `/products` | admin, vendor | Create product (vendor → auto-attached) |
| PATCH | `/products/:id` | admin, vendor (owner) | Update product |
| DELETE | `/products/:id` | admin, vendor (owner) | Soft delete |
| GET | `/orders/mine` | Any | Current user's orders |
| GET | `/orders/:id` | Any (owner) | One order |
| POST | `/orders` | Any | Place order |
| PATCH | `/orders/:id/cancel` | Any (owner) | Cancel a cancellable order |
| GET | `/wishlist` | Any | Current wishlist |
| POST | `/wishlist/:productId` | Any | Add to wishlist |
| DELETE | `/wishlist/:productId` | Any | Remove from wishlist |
| GET | `/categories` | Public | List active categories |
| GET | `/categories/:slug` | Public | One category by slug |
| POST/PATCH/DELETE | `/categories[/:id]` | admin | Manage categories |
| GET | `/reviews/product/:productId` | Public | Reviews for a product |
| POST | `/reviews` | Any | Create review (1 per user/product, auto verified if delivered) |
| DELETE | `/reviews/:id` | Owner or admin | Remove review |
| GET | `/cart` | Any | Get server-side cart |
| POST | `/cart/items` | Any | Add item (`productId`, `quantity`, `color?`, `size?`) |
| PATCH | `/cart/items/:productId` | Any | Update quantity |
| DELETE | `/cart/items/:productId` | Any | Remove line |
| DELETE | `/cart` | Any | Clear cart |
| POST | `/cart/coupon` | Any | Attach/detach `couponCode` to cart |
| POST | `/coupons/validate` | Public | `{ code, subtotal }` → `{ code, discount, type }` |
| GET/POST/PATCH/DELETE | `/coupons[/:id]` | admin | Manage coupons |
| GET | `/payments/mine` | Any | Caller's payment history |
| GET | `/payments/:id` | Owner or admin | One payment |
| GET | `/payments` | admin | All payments (filter by status) |
| PATCH | `/payments/:id/capture` | admin | Mark payment captured |
| PATCH | `/payments/:id/refund` | admin | Mark payment refunded |
| GET | `/notifications` | Any | List notifications (`?unreadOnly=true&limit=20`) |
| GET | `/notifications/unread-count` | Any | `{ count }` |
| PATCH | `/notifications/:id/read` | Any | Mark one as read |
| PATCH | `/notifications/read-all` | Any | Mark all as read |
| DELETE | `/notifications/:id` | Any | Remove a notification |
| GET | `/admin/users` | admin | Paginated user list (filter by role / q) |
| PATCH | `/admin/users/:id/role` | admin | Promote / demote a user |
| PATCH | `/admin/users/:id/deactivate` | admin | Deactivate account |
| PATCH | `/admin/users/:id/activate` | admin | Reactivate account |
| GET | `/admin/orders` | admin | All orders (filter by status) |
| PATCH | `/admin/orders/:id/status` | admin | Move order through fulfillment states |

## Auth model

- **Access token** — JWT signed with `JWT_ACCESS_SECRET`, short-lived (default `15m`).
  Required by all protected routes via `Authorization: Bearer <token>`.
- **Refresh token** — JWT signed with `JWT_REFRESH_SECRET`, long-lived (default `7d`).
  Its hash is persisted on the user document and rotated on every successful
  `/auth/refresh` call.
- `POST /auth/logout` clears the stored hash so an old refresh token can no longer
  mint new access tokens.

## Folder layout

```
src/
├── app.module.ts          # Composition root
├── main.ts                # Bootstrap (helmet, validation, CORS)
├── common/                # Decorators, guards, filters, types
├── auth/                  # Strategies, guards, service, controller, DTOs
├── users/                 # Schema, service, controller, DTOs
├── products/              # Schema, service, controller, DTOs
├── orders/                # Schema, service, controller, DTOs
├── wishlist/              # Schema, service, controller
└── scripts/
    └── seed.ts            # Seed Mongo with demo catalog
```
