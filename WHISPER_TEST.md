# Experimento de transcripción local en iPhone

Abre `/whisper-test.html` en Safari por HTTPS y pulsa **Iniciar prueba**. Autoriza el micrófono y espera la carga del modelo. La captura comienza después de cargarlo, dura 60 segundos y se divide en chunks de 2,5 segundos. El audio se procesa en el dispositivo; solo se descargan el código y los archivos del modelo.

Usa `onnx-community/whisper-tiny`, la variante multilingüe. Transformers.js intenta WebGPU con encoder FP32 y decoder Q4 (pesos ~120 MB); si WebGPU no está disponible o falla, usa WASM con pesos Q8 (~41 MB). La página muestra el tamaño que comunica el cargador cuando está disponible; la primera carga puede incluir archivos auxiliares y el runtime WASM.

Durante la prueba, habla en español durante al menos un minuto. Observa si aparecen transcripciones, los segundos de inferencia y el backlog por chunk, y si el iPhone se calienta, se bloquea o cierra Safari. La latencia mostrada se estima desde la última voz detectada por volumen dentro del chunk; no es un detector de fin de frase. Si el habla cruza un límite de chunk, la estimación y el texto pueden quedar partidos. No hay medición web estándar de temperatura ni memoria total del proceso.

La página no usa Firebase, WebRTC ni servicios de transcripción. GitHub Pages aloja tanto esta prueba como las páginas existentes; publicar la rama experimental actualiza el mismo sitio de Pages hasta el siguiente despliegue.
