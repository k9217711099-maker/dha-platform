import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { theme } from './theme';

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        s.btn,
        primary ? s.btnPrimary : s.btnSecondary,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.btnText, primary ? { color: theme.white } : { color: theme.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#999"
        style={s.input}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <ActivityIndicator color={theme.ink} />
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center' },
  btnPrimary: { backgroundColor: theme.ink },
  btnSecondary: { backgroundColor: theme.white, borderWidth: 1, borderColor: theme.line },
  btnText: { fontSize: 15, fontWeight: '500' },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.line,
    padding: 16,
    marginBottom: 12,
  },
  label: { fontSize: 13, color: theme.darkGray, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: theme.white,
    color: theme.ink,
  },
  h1: { fontSize: 26, fontWeight: '300', color: theme.ink, marginBottom: 4 },
  h2: { fontSize: 18, color: theme.ink, marginBottom: 8 },
  muted: { color: theme.darkGray, fontSize: 14 },
});
