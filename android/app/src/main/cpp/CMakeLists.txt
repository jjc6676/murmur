cmake_minimum_required(VERSION 3.18)
project(murmur_whisper)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
get_filename_component(ANDROID_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(WHISPER_DIR "${ANDROID_ROOT}/.toolchain/whisper.cpp")

# ggml uses fixed target names and caches its ARM feature probes. Configure a separate
# binary tree per ISA so neither the targets nor their probe results can be reused.
if(DEFINED MURMUR_GGML_ARCH)
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
    set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
    set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
    set(GGML_CPU_ARM_ARCH "${MURMUR_GGML_ARCH}" CACHE STRING "" FORCE)
    set(CMAKE_POSITION_INDEPENDENT_CODE ON)
    add_compile_options(-O3 "-march=${MURMUR_GGML_ARCH}")
    add_subdirectory("${WHISPER_DIR}/ggml" ggml)
    return()
endif()

include(ExternalProject)

function(add_whisper_variant target arch dir)
    set(build_dir "${CMAKE_CURRENT_BINARY_DIR}/${dir}")
    set(archives
        "${build_dir}/lib/libggml.a"
        "${build_dir}/lib/libggml-cpu.a"
        "${build_dir}/lib/libggml-base.a")
    ExternalProject_Add(${dir}
        SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}"
        BINARY_DIR "${build_dir}"
        PREFIX "${build_dir}/ep"
        DOWNLOAD_COMMAND ""
        CMAKE_ARGS
            "-DCMAKE_TOOLCHAIN_FILE:FILEPATH=${CMAKE_TOOLCHAIN_FILE}"
            "-DCMAKE_MAKE_PROGRAM:FILEPATH=${CMAKE_MAKE_PROGRAM}"
            "-DANDROID_ABI=${ANDROID_ABI}"
            "-DANDROID_PLATFORM=${ANDROID_PLATFORM}"
            "-DANDROID_STL=${ANDROID_STL}"
            "-DCMAKE_ARCHIVE_OUTPUT_DIRECTORY:PATH=${build_dir}/lib"
            "-DMURMUR_GGML_ARCH=${arch}"
        BUILD_COMMAND "${CMAKE_COMMAND}" --build <BINARY_DIR> --target ggml
        BUILD_ALWAYS ON
        BUILD_BYPRODUCTS ${archives}
        INSTALL_COMMAND "")

    # Only these two shared libraries are packaged. Each embeds its own ggml archives.
    add_library(${target} SHARED
        "${WHISPER_DIR}/src/whisper.cpp"
        "${WHISPER_DIR}/src/aneforge/whisper-aneforge.cpp"
        jni.c)
    add_dependencies(${target} ${dir})
    target_compile_definitions(${target} PRIVATE GGML_USE_CPU WHISPER_VERSION=\"1.7.4-b5907\")
    target_compile_options(${target} PRIVATE -O3 "-march=${arch}" -fvisibility=hidden
        -ffunction-sections -fdata-sections)
    target_include_directories(${target} PRIVATE
        "${WHISPER_DIR}" "${WHISPER_DIR}/include" "${WHISPER_DIR}/src"
        "${WHISPER_DIR}/ggml/include" "${WHISPER_DIR}/ggml/src" "${WHISPER_DIR}/ggml/src/ggml-cpu")
    target_link_libraries(${target} PRIVATE ${archives} log android m dl)
    target_link_options(${target} PRIVATE -Wl,--gc-sections -Wl,--exclude-libs,ALL)
endfunction()

add_whisper_variant(whisper armv8-a gb)
add_whisper_variant(whisper_fp16 armv8.2-a+fp16 gh)
