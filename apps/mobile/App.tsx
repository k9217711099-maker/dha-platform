import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { tokenStore, RoomAvailability, RatePlan } from './src/api';
import { theme } from './src/theme';
import { Loading } from './src/ui';
import { LoginScreen } from './src/screens/LoginScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { PropertyScreen } from './src/screens/PropertyScreen';
import { BookingFormScreen } from './src/screens/BookingFormScreen';
import { PaymentScreen } from './src/screens/PaymentScreen';
import { BookingsScreen } from './src/screens/BookingsScreen';
import { BookingDetailScreen } from './src/screens/BookingDetailScreen';
import { CheckinScreen } from './src/screens/CheckinScreen';
import { LoyaltyScreen } from './src/screens/LoyaltyScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { AiChatFab } from './src/AiChat';

// --- Маршруты (лёгкий стек-навигатор без react-navigation) ---
export type Route =
  | { name: 'search' }
  | { name: 'bookings' }
  | { name: 'loyalty' }
  | { name: 'profile' }
  | { name: 'property'; propertyId: string; checkIn: string; checkOut: string; guests: number }
  | {
      name: 'booking';
      room: RoomAvailability;
      ratePlan: RatePlan;
      checkIn: string;
      checkOut: string;
      guests: number;
    }
  | { name: 'payment'; paymentId: string; amount: number }
  | { name: 'bookingDetail'; id: string }
  | { name: 'checkin'; bookingId: string };

type TabName = 'search' | 'bookings' | 'loyalty' | 'profile';
export interface Nav {
  push: (r: Route) => void;
  replace: (r: Route) => void;
  back: () => void;
  resetTab: (t: TabName) => void;
}

const TABS: { key: TabName; label: string }[] = [
  { key: 'search', label: 'Поиск' },
  { key: 'bookings', label: 'Брони' },
  { key: 'loyalty', label: 'Баллы' },
  { key: 'profile', label: 'Профиль' },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: 'search' }]);

  useEffect(() => {
    tokenStore.get().then((t) => setAuthed(!!t));
  }, []);

  const nav: Nav = {
    push: (r) => setStack((s) => [...s, r]),
    replace: (r) => setStack((s) => [...s.slice(0, -1), r]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    resetTab: (t) => setStack([{ name: t }]),
  };

  if (authed === null) {
    return (
      <SafeAreaView style={st.root}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (!authed) {
    return (
      <SafeAreaView style={st.root}>
        <StatusBar style="dark" />
        <LoginScreen
          onAuthed={() => {
            setStack([{ name: 'search' }]);
            setAuthed(true);
          }}
        />
      </SafeAreaView>
    );
  }

  async function logout() {
    await tokenStore.clear();
    setStack([{ name: 'search' }]);
    setAuthed(false);
  }

  const route = stack[stack.length - 1];
  const canGoBack = stack.length > 1;
  const activeTab = stack[0].name as TabName;

  function render() {
    switch (route.name) {
      case 'search':
        return <SearchScreen nav={nav} />;
      case 'bookings':
        return <BookingsScreen nav={nav} />;
      case 'loyalty':
        return <LoyaltyScreen />;
      case 'profile':
        return <ProfileScreen onLogout={logout} />;
      case 'property':
        return <PropertyScreen nav={nav} route={route} />;
      case 'booking':
        return <BookingFormScreen nav={nav} route={route} />;
      case 'payment':
        return <PaymentScreen nav={nav} route={route} />;
      case 'bookingDetail':
        return <BookingDetailScreen nav={nav} bookingId={route.id} />;
      case 'checkin':
        return <CheckinScreen nav={nav} bookingId={route.bookingId} />;
    }
  }

  return (
    <SafeAreaView style={st.root}>
      <StatusBar style="dark" />
      <View style={st.header}>
        {canGoBack ? (
          <Pressable onPress={nav.back} hitSlop={10}>
            <Text style={st.back}>‹ Назад</Text>
          </Pressable>
        ) : (
          <Text style={st.brand}>D H&A</Text>
        )}
        <Text style={st.brandRight}>D HOTELS & APARTMENTS</Text>
      </View>

      <View style={{ flex: 1 }}>{render()}</View>

      <View style={st.tabbar}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={st.tab} onPress={() => nav.resetTab(t.key)}>
            <Text style={[st.tabText, activeTab === t.key && st.tabActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <AiChatFab />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.beige },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
  },
  brand: { letterSpacing: 3, color: theme.ink, fontSize: 14 },
  brandRight: { letterSpacing: 2, color: theme.darkGray, fontSize: 10 },
  back: { color: theme.ink, fontSize: 15 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.line,
    backgroundColor: theme.white,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { color: theme.darkGray, fontSize: 13 },
  tabActive: { color: theme.ink, fontWeight: '600' },
});
