# Espejo de MCUAPI: películas

Réplica mínima del endpoint de películas de [MCUAPI](https://github.com/AugustoMarcelo/mcuapi), **sin rate limit**. Sirve los mismos datos y con el mismo formato de respuesta. Solo hay que cambiar la URL base en la app.

No tiene dependencias. Solo necesita Node 18 o superior.

## Endpoints

| Petición | Qué hace |
|---|---|
| `GET /api/v1/movies?title=iron&page=1&limit=10` | Búsqueda por título: contiene el texto, sin distinguir mayúsculas |
| `GET /api/v1/movies?filter=title=iron` | La misma búsqueda con la sintaxis de la API original |
| `GET /api/v1/movies/{id}` | Detalle de una película |
| `GET /health` | Comprobación de que el servicio está vivo |

Por defecto `page=1` y `limit=10`; `limit` admite como máximo 100. La respuesta de lista es `{ data, total, page, limit, _links }`. Los errores siguen el formato `application/problem+json` de la original.

> ⚠️ La API original **no acepta `?title=`**: responde 400 con `Unsupported query parameter: title`. Allí la búsqueda es `?filter=title=iron`, y codificada en la URL queda `filter=title%3Diron`. Este espejo acepta ambas formas.

## Ejecutarlo en local

```bash
node server.js            # escucha en http://localhost:3333
PORT=8080 node server.js  # en otro puerto
```

Para que los alumnos lo usen desde el aula con HTTPS, y así evitar las excepciones de ATS, puedes exponerlo con un túnel rápido de Cloudflare. No necesita cuenta:

```bash
cloudflared tunnel --url http://localhost:3333
# te da una URL tipo https://xxxx.trycloudflare.com
```

## Desplegarlo gratis en Render

1. Sube esta carpeta a un repositorio de GitHub.
2. En Render, crea un *New → Blueprint* (lee el `render.yaml`) o un *Web Service* con `node server.js` como comando de arranque.
3. La URL base queda así: `https://<nombre>.onrender.com/api/v1/movies`.

El plan gratuito se duerme tras 15 minutos sin tráfico y tarda entre 30 y 60 segundos en despertar. Abre `/health` unos minutos antes de clase.

## Datos

`movies.json` es una copia de `data/movies.json` del repositorio original. Para actualizarlo, basta con descargar de nuevo:
https://cdn.jsdelivr.net/gh/AugustoMarcelo/mcuapi@master/data/movies.json

