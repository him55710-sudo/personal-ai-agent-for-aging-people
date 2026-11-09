import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LockKeyhole } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Companion, Copy, ErrorNotice, Page } from '../components/ui';
import { useTheme } from '../design/Theme';
import type { Credentials } from '../services/runtime';

type Props = { defaultUrl: string; busy: boolean; error: string; onConnect: (value: Credentials) => Promise<boolean> };
export function ConnectScreen({ defaultUrl, busy, error, onConnect }: Props) {
  const { colors, dark } = useTheme();
  const cover = dark
    ? { canvas: colors.quiet, ink: colors.ink, muted: colors.muted }
    : { canvas: '#FFF6E0', ink: '#2B211B', muted: '#665448' };
  const insets = useSafeAreaInsets();
  const [baseUrl, setBaseUrl] = useState(defaultUrl);
  const [token, setToken] = useState('');
  async function connect() { if (await onConnect({ baseUrl, token })) setToken(''); }
  return <Page><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
      <View style={[styles.brand, { backgroundColor: cover.canvas }]}>
        <View style={styles.brandName}><Copy style={[styles.wordmark, { color: cover.ink }]}>Cheese</Copy><View aria-hidden style={styles.brandDot} /></View>
        <View style={styles.hello}><Companion size={142} decorative /><Copy variant="display" accessibilityRole="header" style={{ color: cover.ink }}>우리의 공간을,{"\n"}연결해 볼까요.</Copy></View>
        <Copy style={[styles.intro, { color: cover.muted }]}>가족이 준비한 연결 정보로{"\n"}치즈를 시작해요.</Copy>
      </View>
      <View style={styles.form}>
        <Copy variant="action">치즈 서버 주소</Copy>
        <TextInput testID="server-url" accessibilityLabel="치즈 서버 주소" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" placeholderTextColor={colors.muted} editable={!busy} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]} />
        <Copy variant="action" style={{ marginTop: 8 }}>내 앱 연결 키</Copy>
        <TextInput testID="connection-token" accessibilityLabel="내 앱 연결 키" value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="나에게 발급된 연결 키" placeholderTextColor={colors.muted} editable={!busy} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]} onSubmitEditing={() => void connect()} />
        <Button testID="connect-account" label="내 치즈 연결하기" busy={busy} disabled={!baseUrl.trim() || !token.trim()} onPress={() => void connect()} />
      </View>
      <ErrorNotice message={error} />
      <View style={styles.promise}><LockKeyhole size={18} color={colors.muted} /><Copy variant="caption" muted style={{ flex: 1 }}>{Platform.OS === 'web' ? '현재 브라우저에서만 연결해요. 새로고침하면 다시 연결해 주세요.' : '연결 키는 이 기기의 보안 저장소에 보관해요. 내 공간은 내 연결 키로만 열 수 있어요.'}</Copy></View>
    </ScrollView>
  </KeyboardAvoidingView></Page>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1 },
  brand: { padding: 20, borderRadius: 24, marginBottom: 20 },
  brandName: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFC93C' },
  wordmark: { fontSize: 30, fontWeight: '700', letterSpacing: -1.8 },
  hello: { marginTop: 10, gap: 4 }, intro: { marginTop: 12 }, form: { gap: 12 },
  input: { minHeight: 58, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1, borderRadius: 16, fontSize: 16 },
  promise: { flexDirection: 'row', gap: 10, marginTop: 24, alignItems: 'flex-start' },
});
