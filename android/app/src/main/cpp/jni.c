#include <jni.h>
#include <android/log.h>
#include <math.h>
#include <limits.h>
#include <string.h>
#include "whisper.h"

#define LOG_TAG "MurmurWhisper"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

static void fail(JNIEnv *env, const char *message) {
    if ((*env)->ExceptionCheck(env)) return;
    jclass type = (*env)->FindClass(env, "java/lang/IllegalStateException");
    if (type != NULL) (*env)->ThrowNew(env, type, message);
}

// Upstream diagnostics may include decoded tokens. Log only our own numeric diagnostics.
static void discard_whisper_log(enum ggml_log_level level, const char *text, void *user_data) {
    (void) level;
    (void) text;
    (void) user_data;
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
    (void) vm;
    (void) reserved;
    whisper_log_set(discard_whisper_log, NULL);
    return JNI_VERSION_1_6;
}

JNIEXPORT jlong JNICALL
Java_com_whispercpp_whisper_WhisperLib_initContext(JNIEnv *env, jobject self, jstring path) {
    (void) self;
    if (path == NULL) {
        fail(env, "Missing speech model path");
        return 0;
    }
    const char *value = (*env)->GetStringUTFChars(env, path, 0);
    if (value == NULL) {
        fail(env, "Could not access speech model path");
        return 0;
    }
    struct whisper_context *context = whisper_init_from_file_with_params(value, whisper_context_default_params());
    (*env)->ReleaseStringUTFChars(env, path, value);
    return (jlong) context;
}

JNIEXPORT void JNICALL
Java_com_whispercpp_whisper_WhisperLib_freeContext(JNIEnv *env, jobject self, jlong pointer) {
    (void) env; (void) self;
    whisper_free((struct whisper_context *) pointer);
}

JNIEXPORT void JNICALL
Java_com_whispercpp_whisper_WhisperLib_fullTranscribe(JNIEnv *env, jobject self, jlong pointer, jint threads, jfloatArray audio) {
    (void) self;
    struct whisper_context *context = (struct whisper_context *) pointer;
    if (context == NULL || audio == NULL) {
        fail(env, "Missing speech context or audio");
        return;
    }
    jfloat *samples = (*env)->GetFloatArrayElements(env, audio, 0);
    if (samples == NULL) {
        fail(env, "Could not access audio samples");
        return;
    }
    const jsize sample_count = (*env)->GetArrayLength(env, audio);
    struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_realtime = false;
    params.print_progress = false;
    params.print_timestamps = false;
    params.print_special = false;
    params.translate = false;
    params.language = "en";
    params.n_threads = threads;
    params.offset_ms = 0;
    params.no_context = true;
    params.no_timestamps = true;
    params.single_segment = true;
    params.greedy.best_of = 1;
    const int clip_context = (int) ceilf(((float) sample_count / 16000.0f) * 50.0f) + 100;
    params.audio_ctx = clip_context < 256 ? 256 : (clip_context > 1500 ? 1500 : clip_context);
    whisper_reset_timings(context);
    LOGI("transcribe samples=%d threads=%d audio_ctx=%d", sample_count, threads, params.audio_ctx);
    const int status = whisper_full(context, params, samples, sample_count);
    (*env)->ReleaseFloatArrayElements(env, audio, samples, JNI_ABORT);
    if (status != 0) fail(env, "Whisper decoding failed");
}

JNIEXPORT jint JNICALL
Java_com_whispercpp_whisper_WhisperLib_getTextSegmentCount(JNIEnv *env, jobject self, jlong pointer) {
    (void) env; (void) self;
    return whisper_full_n_segments((struct whisper_context *) pointer);
}

JNIEXPORT jbyteArray JNICALL
Java_com_whispercpp_whisper_WhisperLib_getTextSegment(JNIEnv *env, jobject self, jlong pointer, jint index) {
    (void) self;
    const char *text = whisper_full_get_segment_text((struct whisper_context *) pointer, index);
    if (text == NULL) {
        fail(env, "Missing decoded segment");
        return NULL;
    }
    const size_t length = strlen(text);
    if (length > INT_MAX) {
        fail(env, "Decoded segment is too large");
        return NULL;
    }
    jbyteArray bytes = (*env)->NewByteArray(env, (jsize) length);
    if (bytes == NULL) {
        fail(env, "Could not allocate decoded segment");
        return NULL;
    }
    (*env)->SetByteArrayRegion(env, bytes, 0, (jsize) length, (const jbyte *) text);
    return bytes;
}
