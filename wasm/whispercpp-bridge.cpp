// Minimal single-thread bridge around whisper.cpp for the isolated iPhone PoC.
#include "whisper.h"

#include <string>

static whisper_context * context = nullptr;
static std::string transcript;

extern "C" {

int whisper_test_init(void * model, int size) {
    if (context) whisper_free(context);
    context = whisper_init_from_buffer_with_params(model, size, whisper_context_default_params());
    if (!context) return -1;
    if (!whisper_is_multilingual(context)) {
        whisper_free(context);
        context = nullptr;
        return -2;
    }
    return 0;
}

int whisper_test_transcribe(const float * audio, int samples) {
    if (!context || !audio || samples <= 0) return -1;
    transcript.clear();
    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = 1;
    params.language = "es";
    params.translate = false;
    params.no_context = true;
    params.single_segment = true;
    params.print_realtime = false;
    params.print_progress = false;
    params.print_timestamps = false;
    params.print_special = false;
    params.max_tokens = 64;
    params.audio_ctx = 768;
    params.temperature_inc = -1.0f;
    const int result = whisper_full(context, params, audio, samples);
    if (result != 0) return result;
    const int count = whisper_full_n_segments(context);
    for (int index = 0; index < count; ++index) transcript += whisper_full_get_segment_text(context, index);
    return 0;
}

const char * whisper_test_text() { return transcript.c_str(); }

void whisper_test_free() {
    if (context) whisper_free(context);
    context = nullptr;
    transcript.clear();
}

}
