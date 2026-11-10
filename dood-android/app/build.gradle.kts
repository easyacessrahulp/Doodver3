plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dood.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.dood.app"
        minSdk = 29
        targetSdk = 34
        versionCode = 4
        versionName = "1.3"
    }

    // A fixed key kept in this repository, so every build can update the one before it.
    // This is fine for installing on your own team's phones. It is NOT a Google Play key.
    signingConfigs {
        create("dood") {
            storeFile = file("dood.keystore")
            storePassword = "doodapp123"
            keyAlias = "dood"
            keyPassword = "doodapp123"
        }
    }

    buildTypes {
        debug { signingConfig = signingConfigs.getByName("dood") }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("dood")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
}
