import React from 'react';
import { ActivityIndicator, View } from 'react-native';


export default function Loading() {
return (
<View style={{ padding: 24, alignItems: 'center' }}>
<ActivityIndicator size="large" />
</View>
);
}