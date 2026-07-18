// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.1"),
        .package(name: "CapacitorFirebaseMessaging", path: "../../../../../node_modules/@capacitor-firebase/messaging"),
        .package(name: "CapacitorApp", path: "../../../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../../../node_modules/@capacitor/browser"),
        .package(name: "CapacitorHaptics", path: "../../../../../node_modules/@capacitor/haptics"),
        .package(name: "CapacitorPreferences", path: "../../../../../node_modules/@capacitor/preferences"),
        .package(name: "CapacitorStatusBar", path: "../../../../../node_modules/@capacitor/status-bar"),
        .package(name: "CapawesomeCapacitorBadge", path: "../../../../../node_modules/@capawesome/capacitor-badge"),
        .package(name: "CapawesomeCapacitorFilePicker", path: "../../../../../node_modules/@capawesome/capacitor-file-picker"),
        .package(name: "CapgoCameraPreview", path: "../../../../../node_modules/@capgo/camera-preview"),
        .package(name: "CapgoCapacitorNativeBiometric", path: "../../../../../node_modules/@capgo/capacitor-native-biometric"),
        .package(name: "CapgoCapacitorUpdater", path: "../../../../../node_modules/@capgo/capacitor-updater"),
        .package(name: "CapgoCapacitorUploader", path: "../../../../../node_modules/@capgo/capacitor-uploader"),
        .package(name: "RevenuecatPurchasesCapacitor", path: "../../../../../node_modules/@revenuecat/purchases-capacitor")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseMessaging", package: "CapacitorFirebaseMessaging"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapawesomeCapacitorBadge", package: "CapawesomeCapacitorBadge"),
                .product(name: "CapawesomeCapacitorFilePicker", package: "CapawesomeCapacitorFilePicker"),
                .product(name: "CapgoCameraPreview", package: "CapgoCameraPreview"),
                .product(name: "CapgoCapacitorNativeBiometric", package: "CapgoCapacitorNativeBiometric"),
                .product(name: "CapgoCapacitorUpdater", package: "CapgoCapacitorUpdater"),
                .product(name: "CapgoCapacitorUploader", package: "CapgoCapacitorUploader"),
                .product(name: "RevenuecatPurchasesCapacitor", package: "RevenuecatPurchasesCapacitor")
            ]
        )
    ]
)
