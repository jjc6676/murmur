import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseKeys = Properties()
val keyFile = rootProject.file("keystore.properties")
val signingIssue = runCatching {
    require(keyFile.isFile) { "Missing android/keystore.properties." }
    keyFile.inputStream().use { releaseKeys.load(it) }
    for (key in listOf("storeFile", "storePassword", "keyAlias", "keyPassword")) {
        require(!releaseKeys.getProperty(key).isNullOrBlank()) { "Missing $key in android/keystore.properties." }
    }
    require(rootProject.file(releaseKeys.getProperty("storeFile")).isFile) {
        "storeFile in android/keystore.properties does not point to a keystore file."
    }
}.exceptionOrNull()

signingIssue?.let { issue ->
    val message = "Cannot package a release: ${issue.message} " +
        "Restore the existing release key or, for a new app, run scripts/create-release-key.ps1."
    val requireReleaseKey = tasks.register("requireReleaseKey") {
        doLast { throw GradleException(message) }
    }
    val releasePackaging = setOf("assembleRelease", "bundleRelease", "packageRelease", "packageReleaseBundle")
    tasks.matching { it.name in releasePackaging }.configureEach {
        dependsOn(requireReleaseKey)
    }
}

android {
    namespace = "com.murmur.android"
    compileSdk = 36
    ndkVersion = "28.2.13676358"
    defaultConfig {
        applicationId = "com.murmur.android"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "0.3.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        ndk { abiFilters += "arm64-v8a" }
        externalNativeBuild { cmake { arguments += "-DCMAKE_BUILD_TYPE=Release"; cppFlags += "-std=c++17" } }
    }
    signingConfigs {
        if (signingIssue == null) {
            create("release") {
                storeFile = rootProject.file(releaseKeys.getProperty("storeFile"))
                storePassword = releaseKeys.getProperty("storePassword")
                keyAlias = releaseKeys.getProperty("keyAlias")
                keyPassword = releaseKeys.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        debug { isJniDebuggable = false }
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt"); version = "3.31.6" } }
    sourceSets["main"].assets.srcDirs("src/main/assets", "../../resources/whisper/models")
    sourceSets["androidTest"].assets.srcDir("../../tests/fixtures")
    androidResources { noCompress += listOf("bin", "wav") }
    packaging { jniLibs.useLegacyPackaging = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    val composeBom = platform("androidx.compose:compose-bom:2025.04.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
