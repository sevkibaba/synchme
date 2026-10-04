import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  View,
} from "react-native";
import { ScreenType } from "../../App";
import AnimatedPartyLogo from "../components/AnimatedPartyLogo";

export default function Home({
  onNavigate,
}: {
  onNavigate: (screen: ScreenType) => void;
}) {
  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.container}>
        <AnimatedPartyLogo />
        <Text style={s.eyebrow}>ONE BEAT. ALL OF US.</Text>
        <Text style={s.title}>
          NO NOISE.{"\n"}
          <Text style={{ color: "#C1FF3D" }}>MORE PARTY.</Text>
        </Text>
        <Text style={s.subtitle}>Headphones on. One shared beat.</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={s.primary}
          onPress={() => onNavigate("HOST")}
        >
          <Text style={s.primaryText}>LET’S PARTY ↗</Text>
          <Text style={s.primaryHint}>Be the DJ · Build your set</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={s.secondary}
          onPress={() => onNavigate("GUEST")}
        >
          <Text style={s.secondaryText}>JOIN THE PARTY →</Text>
        </TouchableOpacity>
        <Text style={s.footer}>
          CONNECT VIA BLUETOOTH · LISTEN ON HEADPHONES
        </Text>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 26,
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 10,
    color: "#A6A7BB",
    letterSpacing: 3,
    marginBottom: 12,
  },
  title: {
    fontSize: 43,
    lineHeight: 49,
    fontWeight: "900",
    color: "#F4F5FA",
    letterSpacing: -2,
  },
  subtitle: { color: "#9899AF", fontSize: 15, marginTop: 14, marginBottom: 30 },
  primary: { backgroundColor: "#C1FF3D", padding: 21, borderRadius: 16 },
  primaryText: {
    color: "#101507",
    fontWeight: "900",
    fontSize: 23,
    letterSpacing: 1,
  },
  primaryHint: { color: "#354710", marginTop: 5, fontSize: 12 },
  secondary: {
    borderWidth: 1,
    borderColor: "#454159",
    padding: 19,
    borderRadius: 16,
    marginTop: 12,
    alignItems: "center",
  },
  secondaryText: {
    color: "#F4F5FA",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  footer: {
    color: "#74768C",
    textAlign: "center",
    fontSize: 9,
    letterSpacing: 1.3,
    marginTop: 24,
  },
});
