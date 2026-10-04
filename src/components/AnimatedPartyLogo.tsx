import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  StyleSheet,
  View,
} from "react-native";

// Positions use the original 1280-pixel artwork coordinate system.
const pairs = [
  {
    color: "#C1FF3D",
    rays: [
      [232, 483, -45],
      [260, 460, -18],
    ],
  },
  {
    color: "#FF4DD8",
    rays: [
      [398, 353, -32],
      [430, 332, -3],
    ],
  },
  {
    color: "#C1FF3D",
    rays: [
      [643, 243, 0],
      [693, 262, 35],
    ],
  },
  {
    color: "#FF4DD8",
    rays: [
      [852, 401, 18],
      [878, 430, 53],
    ],
  },
  {
    color: "#C1FF3D",
    rays: [
      [1038, 516, 23],
      [1061, 542, 48],
    ],
  },
];

export default function AnimatedPartyLogo() {
  const [width, setWidth] = useState(0);
  const pulses = useRef(pairs.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let reducedMotion = true;
    let active = AppState.currentState === "active";
    let disposed = false;
    let preferenceReceived = false;
    let loops: Animated.CompositeAnimation[] = [];
    const update = () => {
      loops.forEach((loop) => loop.stop());
      pulses.forEach((pulse) => pulse.setValue(0));
      loops = [];
      if (reducedMotion || !active || disposed) return;
      loops = pulses.map((pulse, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(index * 130),
            Animated.timing(pulse, {
              toValue: 1,
              duration: 570,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
              isInteraction: false,
            }),
            Animated.timing(pulse, {
              toValue: 0,
              duration: 690,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
              isInteraction: false,
            }),
          ]),
        ),
      );
      loops.forEach((loop) => loop.start());
    };
    const motionSubscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        preferenceReceived = true;
        reducedMotion = value;
        update();
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (disposed || preferenceReceived) return;
        reducedMotion = value;
        update();
      })
      .catch(() => {});
    const appSubscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      update();
    });
    return () => {
      disposed = true;
      loops.forEach((loop) => loop.stop());
      motionSubscription.remove();
      appSubscription.remove();
    };
  }, [pulses]);

  const unit = width / 1280;
  return (
    <View
      style={styles.frame}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="SILENT CLUB — people dancing together with headphones"
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: "absolute",
          width,
          height: width,
          top: (width / 1.3 - width) / 2,
        }}
      >
        <Image
          source={require("../../assets/silent-club-crowd-base.png")}
          style={{ width: "100%", height: "100%" }}
          resizeMode="contain"
        />
        {pairs.flatMap((pair, index) =>
          pair.rays.map(([x, y, angle], ray) => (
            <View
              key={`${index}-${ray}`}
              style={{
                position: "absolute",
                left: (x - 6) * unit,
                top: (y - 21) * unit,
                width: 12 * unit,
                height: 42 * unit,
                transform: [{ rotate: `${angle}deg` }],
              }}
            >
              <Animated.View
                style={{
                  flex: 1,
                  borderRadius: 8 * unit,
                  backgroundColor: pair.color,
                  shadowColor: pair.color,
                  shadowOpacity: 0.95,
                  shadowRadius: 12 * unit,
                  shadowOffset: { width: 0, height: 0 },
                  opacity: pulses[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.75, 1],
                  }),
                  transform: [
                    {
                      scaleY: pulses[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.65, 1.35],
                      }),
                    },
                  ],
                }}
              />
            </View>
          )),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 1.3,
    overflow: "hidden",
    marginBottom: 30,
  },
});
