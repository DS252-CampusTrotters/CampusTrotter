import React from 'react';
import { View, Text, Pressable } from 'react-native';


export default function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
return (
<View style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
<Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Something went wrong</Text>
<Text style={{ color: '#555', textAlign: 'center' }}>{message}</Text>
{onRetry && <Pressable onPress={onRetry} style={{ marginTop: 12, padding: 10, backgroundColor: '#111827', borderRadius: 8 }}><Text style={{ color: 'white' }}>Retry</Text></Pressable>}
</View>
);
}