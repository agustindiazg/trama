# Trama

Trama transforma un CV en PDF en una versión LaTeX limpia y compatible con sistemas ATS. Puede reconstruir la estructura del documento, proponer mejoras autorizadas por el usuario y comparar el perfil con una oferta laboral.

## Funcionalidades

- Extracción local del texto de archivos PDF.
- Interpretación visual y estructurada mediante la API de Anthropic.
- Generación de un CV en LaTeX editable y descarga directa en PDF.
- Auditoría ATS y comparación de palabras clave con una oferta.
- Jurado multiagente con reclutador, auditor ATS, cuantificador y estratega de posicionamiento.
- Veredicto consolidado, resumen profesional en tres líneas y plan de mejora priorizado.
- Historial local de versiones y preferencias en el navegador.
- Límite de 10 MB por archivo.

## Requisitos

- Node.js 20 o superior.
- npm.
- Una API key de Anthropic.

## Desarrollo local

```bash
git clone <URL-DEL-REPOSITORIO>
cd improve.cv
npm ci
cp .env.example .env
npm run dev
```

Completá `ANTHROPIC_API_KEY` en `.env` y abrí [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Sí | Clave privada usada exclusivamente por el servidor. |
| `ANTHROPIC_MODEL` | No | Modelo de Anthropic; por defecto se usa `claude-sonnet-4-6`. |

Nunca expongas la clave con el prefijo `NEXT_PUBLIC_` ni subas tu archivo `.env`.

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm test        # pruebas unitarias
npm run build   # build de producción
npm start       # ejecutar el build
```

## Assets de marketing

El proyecto Remotion vive en `marketing-video/`. El repositorio guarda las composiciones y su lockfile, pero no dependencias, bundles ni videos renderizados.

```bash
npm run marketing:install  # instalar dependencias del proyecto de video
npm run marketing:dev      # abrir Remotion Studio
npm run marketing:check    # validar TypeScript y ESLint
npm run marketing:build    # comprobar que la composición genera un bundle
```

Los renders deben escribirse dentro de `marketing-video/out/`. Esa carpeta está ignorada por Git porque los videos se pueden regenerar desde el código fuente.

## Despliegue

El proyecto es una aplicación Next.js y necesita un runtime Node.js para la ruta `/api/interpret-cv`; no alcanza con servir archivos estáticos. En Vercel u otra plataforma compatible, configurá `ANTHROPIC_API_KEY` como secreto del entorno y usá los comandos estándar de Next.js.

## Privacidad

Los PDFs se envían al backend de la aplicación y desde allí a Anthropic para su interpretación. El historial y las preferencias se guardan localmente en el navegador. Antes de desplegar públicamente, revisá las condiciones y la política de privacidad aplicables a tu servicio.

## Estado del proyecto

Proyecto en desarrollo. El repositorio no incluye una licencia de código abierto; por defecto, todos los derechos quedan reservados.
