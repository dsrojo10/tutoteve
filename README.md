# TutoTeVe — prototipo WebRTC

Experimento mínimo: un celular captura cámara y micrófono; un Samsung Smart TV recibe el stream WebRTC. Firebase Realtime Database solo transporta señalización; no se guarda audio ni vídeo.

Estado del experimento: **PoC validado (SUCCESS)** en Firefox PC y Samsung Smart TV con audio, vídeo y latencia aceptable. Consulta [`POC_STATUS.md`](./POC_STATUS.md) para la referencia técnica y sus límites.

## MVP de llamada

El TV crea una sesión temporal y muestra un código de seis dígitos para vincular el celular de Tuto. Ese celular crea un enlace de invitación con un token aleatorio fuerte. Hay dos conexiones WebRTC: Tuto↔familiar (audio/vídeo bidireccional) y familiar→TV (solo recepción en TV). Esta topología evita reenviar media desde el TV y mantiene su uso limitado a la reproducción, que es la opción más simple para compatibilidad con Samsung.

RTDB conserva únicamente señalización temporal: `sessions/{sessionId}` contiene propietario, roles y señales por enlace; `pairingCodes/{code}` y `invites/{token}` son descubrimiento temporal. Ninguna ruta almacena audio ni vídeo.

## Requisitos

- Node.js 18+.
- Un celular y un TV Samsung, preferiblemente Tizen 5.0 / modelo 2019 o posterior.
- Un proyecto Firebase nuevo y separado para TutoTeVe, con Authentication anónima y Realtime Database.
- Una URL HTTPS accesible por ambos dispositivos. Cámara y micrófono no funcionan desde HTTP, salvo `localhost`.

## Configuración Firebase

1. Crea un proyecto Firebase separado y registra una aplicación web.
2. Habilita **Authentication > Sign-in method > Anonymous**.
3. Crea una Realtime Database y publica las reglas de [`firebase.database.rules.json`](./firebase.database.rules.json).
4. Copia `.env.example` a `.env.local` y completa estas variables:

```sh
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

`.env.local` está ignorado. Las claves de configuración web de Firebase no se muestran en la interfaz ni en `?debug=1`; no añadas secretos de servidor a Vite.

## Ejecutar localmente

```sh
npm install
npm run dev
```

## Flujo de prueba HTTPS

1. Expón la aplicación por HTTPS en una red accesible para el celular y TV.
2. Abre `/tv.html`: el TV inicia Auth anónima, crea `sessionId` criptográficamente aleatorio y muestra un código de seis dígitos válido 15 minutos.
3. Abre `/` en el celular, introduce el código y pulsa **Iniciar cámara**. Autoriza cámara y micrófono.
4. RTDB entrega la offer/answer e intercambia ICE candidates; el TV reproduce el stream. Pulsa **Activar reproducción** si su navegador bloquea autoplay.
5. Mantén el vídeo por tres minutos y usa `?debug=1` para registrar estados sin revelar SDP, ICE, UID completo ni credenciales.
6. Pulsa **Terminar prueba** en el TV para borrar la sala; la desconexión del TV también programa su limpieza.

## Estructura RTDB

```text
pairingCodes/{6-digit-code} -> { sessionId, ownerUid, expiresAt }
rooms/{sessionId}/ownerUid
rooms/{sessionId}/phoneUid
rooms/{sessionId}/expiresAt
rooms/{sessionId}/offer
rooms/{sessionId}/answer
rooms/{sessionId}/candidates/{phone|tv}/{pushId}
```

Las reglas requieren Auth anónima, dejan al TV propietario crear/eliminar la sala, permiten a un único celular reclamar `phoneUid`, y restringen offer/answer/candidates al lado correspondiente. El código es un mecanismo temporal de descubrimiento, no una credencial de alta entropía; el `sessionId` aleatorio limita el acceso posterior.

## Compatibilidad Samsung

Samsung documenta WebRTC en el motor web de Tizen 5.0+ y soporte parcial en Tizen 4.0; los modelos más antiguos no aparecen con soporte. El resultado debe comprobarse en el modelo objetivo usando `?debug=1`, especialmente por diferencias de códec y autoplay. Fuente: [Samsung Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html).
