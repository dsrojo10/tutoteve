# WASM experimental

`public/whispercpp/whispercpp.{js,wasm}` compila el núcleo oficial de
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) en el commit
`60c0be6ac8fa71b1a2ae2dd938a31a34a508e774` (1.9.4-dev), con
Emscripten SDK 4.0.12. Es un build SIMD de un solo hilo, sin pthreads ni
memoria inicial de 1 GB. La inferencia se ejecuta en un Web Worker.

Para reproducirlo en un checkout limpio de ese commit:

```sh
git apply /ruta/a/tutoteve/wasm/whispercpp-single-thread.patch
emcmake cmake -S . -B build-ios-wasm -DWHISPER_BUILD_EXAMPLES=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DGGML_NATIVE=OFF -DCMAKE_C_FLAGS=-msimd128 -DCMAKE_CXX_FLAGS=-msimd128
cmake --build build-ios-wasm --target whisper -j 2
em++ -O3 -msimd128 -I include -I ggml/include /ruta/a/tutoteve/wasm/whispercpp-bridge.cpp build-ios-wasm/src/libwhisper.a build-ios-wasm/ggml/src/libggml.a build-ios-wasm/ggml/src/libggml-cpu.a build-ios-wasm/ggml/src/libggml-base.a -s MODULARIZE=1 -s EXPORT_NAME=createWhisperModule -s ENVIRONMENT=worker -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=134217728 -s MAXIMUM_MEMORY=805306368 -s FILESYSTEM=0 -s EXPORTED_FUNCTIONS='["_malloc","_free","_whisper_test_init","_whisper_test_transcribe","_whisper_test_text","_whisper_test_free"]' -s EXPORTED_RUNTIME_METHODS='["UTF8ToString","HEAPU8","HEAPF32"]' -o whispercpp.js
```

Copiar `whispercpp.js` y `whispercpp.wasm` a `public/whispercpp/`.
El modelo `ggml-tiny-q5_1.bin` no se incluye en el repositorio: la página lo
descarga desde el repositorio oficial de Hugging Face en cada carga, sujeto al
caché del navegador. Solo los pesos viajan por red; el audio permanece local.
