# TutoTeVe — experimento inicial WebRTC

## Objetivo de prueba

Comprobar si un celular real puede capturar cámara y micrófono y enviar una transmisión WebRTC en vivo a un Samsung Smart TV, abierto en su navegador, mediante HTTPS. Firebase Realtime Database intercambia offer, answer e ICE candidates. El TV crea una sala temporal, muestra un código de seis dígitos y el celular lo introduce. No se almacenan datos multimedia.

## Alcance

- `/`: emisor en celular, con cámara, micrófono, vista previa y conexión WebRTC.
- `/tv.html`: receptor para TV, con vídeo remoto grande y controles mínimos.
- Diagnóstico opcional con `?debug=1`.
- Un servidor STUN público para descubrir candidatos cuando los pares no estén en la misma red local.

## Fuera de alcance

- Subtítulos, reconocimiento de voz, QR, diseño final, login, contactos, historial y llamadas multiusuario.
- Backend propio, App Check y almacenamiento de audio o vídeo.
- TURN y cualquier workaround grande específico de un modelo de TV.

## Criterio de éxito

Con ambos dispositivos en una URL HTTPS, el TV Samsung reproduce el vídeo remoto en vivo desde un celular durante al menos tres minutos sin interrupción.

## Criterio de fracaso útil

Si el TV no expone `RTCPeerConnection`, no puede reproducir el `MediaStream` remoto o no negocia un códec compatible, se documentará el modelo, versión de Tizen, user agent, estados y error antes de intentar soluciones mayores.

## Riesgos conocidos

- Samsung declara WebRTC para Tizen 5.0+ (TV 2019+) y soporte parcial en Tizen 4.0 (2018); modelos anteriores no están cubiertos. El navegador integrado y una app Tizen pueden diferir.
- Los códecs negociados y las políticas de autoplay varían por modelo. El receptor incluye un botón para iniciar reproducción si el TV bloquea el autoplay.
- STUN no resuelve todas las topologías NAT/firewall; sin TURN, conexiones entre redes pueden fallar.
- Cámara y micrófono requieren HTTPS (o localhost) y permiso del usuario.
- El código de seis dígitos es solo descubrimiento y expira a los 15 minutos; el `sessionId` interno aleatorio es el identificador de la sala.
