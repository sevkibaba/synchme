import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  View,
} from "react-native";

export default function ClubBackground() {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let reduced = true;
    let active = AppState.currentState === "active";
    let disposed = false;
    let preferenceReceived = false;
    let animation: Animated.CompositeAnimation | undefined;
    const update = () => {
      animation?.stop();
      phase.setValue(0);
      if (reduced || !active || disposed) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(phase, {
            toValue: 1,
            duration: 8500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(phase, {
            toValue: 0,
            duration: 8500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      );
      animation.start();
    };
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        preferenceReceived = true;
        reduced = value;
        update();
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (disposed || preferenceReceived) return;
        reduced = value;
        update();
      })
      .catch(() => {});
    const state = AppState.addEventListener("change", (value) => {
      active = value === "active";
      update();
    });
    return () => {
      disposed = true;
      animation?.stop();
      motion.remove();
      state.remove();
    };
  }, [phase]);

  const interpolate = (from: number, to: number) =>
    phase.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backdrop}
    >
      <Animated.View
        style={[
          styles.light,
          styles.pink,
          {
            opacity: interpolate(0.55, 0.85),
            transform: [
              { translateX: interpolate(-35, 55) },
              { translateY: interpolate(-20, 65) },
              { rotate: "-28deg" },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.light,
          styles.violet,
          {
            opacity: interpolate(0.8, 0.48),
            transform: [
              { translateX: interpolate(35, -45) },
              { translateY: interpolate(45, -25) },
              { rotate: "30deg" },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.haze,
          {
            opacity: interpolate(0.42, 0.7),
            transform: [
              { translateX: interpolate(-45, 35) },
              { scale: interpolate(0.9, 1.15) },
            ],
          },
        ]}
      />
      <View style={styles.shade} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: "#090A10",
  },
  light: { position: "absolute", width: "100%", height: "95%", top: "-28%" },
  pink: {
    left: "-38%",
    experimental_backgroundImage:
      "radial-gradient(ellipse at center, rgba(255, 45, 180, 0.48) 0%, rgba(180, 25, 120, 0.18) 38%, rgba(180, 25, 120, 0) 70%)",
  },
  violet: {
    right: "-38%",
    experimental_backgroundImage:
      "radial-gradient(ellipse at center, rgba(104, 65, 255, 0.52) 0%, rgba(80, 45, 200, 0.19) 40%, rgba(80, 45, 200, 0) 70%)",
  },
  haze: {
    position: "absolute",
    left: "-35%",
    bottom: "-28%",
    width: "130%",
    height: "75%",
    experimental_backgroundImage:
      "radial-gradient(ellipse at center, rgba(150, 205, 45, 0.26) 0%, rgba(95, 135, 30, 0.10) 40%, rgba(95, 135, 30, 0) 70%)",
  },
  shade: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(9, 10, 16, 0) 15%, rgba(9, 10, 16, 0.42) 55%, rgba(9, 10, 16, 0.12) 100%)",
  },
});
