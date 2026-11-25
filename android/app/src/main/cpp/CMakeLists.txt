cmake_minimum_required(VERSION 3.18)
project(murmur_whisper)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
get_filename_component(ANDROID_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(WHISPER_DIR "${ANDROID_ROOT}/.toolchain/whisper.cpp")
find_library(LOG_LIB log)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
# Snapdragon 845 exposes FP16 arithmetic but not ARM dot-product instructions.
set(GGML_CPU_ARM_ARCH "armv8.2-a+fp16" CACHE STRING "" FORCE)
add_subdirectory("${WHISPER_DIR}/ggml" "${CMAKE_BINARY_DIR}/ggml")
target_compile_options(ggml-cpu PRIVATE -O3)
add_library(whisper SHARED
    "${WHISPER_DIR}/src/whisper.cpp"
    "${WHISPER_DIR}/src/aneforge/whisper-aneforge.cpp"
    "${CMAKE_CURRENT_LIST_DIR}/jni.c")
target_compile_definitions(whisper PUBLIC GGML_USE_CPU PRIVATE WHISPER_VERSION=\"1.7.4-b5907\")
target_compile_options(whisper PRIVATE -O3 -march=armv8.2-a+fp16 -fvisibility=hidden -fvisibility-inlines-hidden -ffunction-sections -fdata-sections)
target_include_directories(whisper PRIVATE "${WHISPER_DIR}" "${WHISPER_DIR}/include" "${WHISPER_DIR}/src" "${WHISPER_DIR}/ggml/include" "${WHISPER_DIR}/ggml/src" "${WHISPER_DIR}/ggml/src/ggml-cpu")
target_link_libraries(whisper ${LOG_LIB} android ggml)
target_link_options(whisper PRIVATE -Wl,--gc-sections -Wl,--exclude-libs,ALL)
