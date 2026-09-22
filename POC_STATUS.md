# Estado del PoC WebRTC — SUCCESS

## Objetivo

Validar que un celular puede enviar cámara y micrófono en vivo y que un Samsung Smart TV puede reproducirlos de forma estable durante la prueba.

## Resultado

**SUCCESS.** La validación manual confirmó vídeo y audio del celular en Firefox PC y Samsung Smart TV, con latencia aceptable.

## Arquitectura validada

- Frontend vanilla JavaScript + Vite, sin framework.
- Firebase Realtime Database para señalización temporal.
- Firebase Anonymous Auth.
- Pairing mediante código de 6 dígitos y `sessionId` interno aleatorio.
- WebRTC P2P nativo: vídeo y audio unidireccionales del celular al TV.
- STUN público; TURN no fue necesario.

## Limitaciones conocidas

- No hay TURN; otras redes/NAT podrían requerirlo.
- La compatibilidad puede variar por modelo y versión de Tizen, códecs y políticas de autoplay.
- Las salas y la señalización son temporales; no se almacenan audio ni vídeo.
- La prueba no sustituye una evaluación prolongada en más modelos, redes y condiciones.

Este estado **no es todavía el MVP final**. Quedan fuera subtítulos, SpeechRecognition, QR, cuentas, contactos, historial, videollamada bidireccional y diseño final.
