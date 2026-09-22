# Estado del MVP — stable call flow

## Hito

**Stable call flow validado manualmente** en tres dispositivos, incluido un Samsung Smart TV.

## Flujo validado

1. El TV inicia con una interacción del usuario, crea una sesión temporal y muestra un código de 6 dígitos.
2. El celular de Tuto introduce el código y se vincula como cámara y micrófono.
3. Tuto genera y comparte un enlace temporal fuerte para invitar al familiar.
4. El familiar abre el enlace directamente, entra sin introducir código y concede cámara y micrófono.
5. Tuto y el familiar se ven y oyen. El TV recibe y reproduce el vídeo y audio del familiar.

## Arquitectura validada

- JavaScript nativo, Vite y Firebase Anonymous Auth.
- Firebase Realtime Database para señalización y presencia temporal; no se guardan medios.
- WebRTC P2P con dos conexiones: Tuto↔familiar bidireccional y familiar→TV, donde el TV solo recibe.
- STUN actual: `stun:stun.l.google.com:19302`.
- El flujo y la reproducción inicial se probaron en Samsung Smart TV.
- TURN no fue necesario en las pruebas realizadas.

## Limitaciones pendientes

- Subtítulos.
- Pruebas en redes externas y topologías NAT diversas; la conectividad podría requerir TURN en esos casos.
- Diseño final.

Este checkpoint registra el flujo base validado y precede el trabajo de subtítulos.
