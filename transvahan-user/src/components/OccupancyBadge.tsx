import React from 'react';
import { View, Text } from 'react-native';


export default function OccupancyBadge({ occupancy, capacity }: { occupancy: number; capacity: number }) {
const pct = Math.round((occupancy / capacity) * 100);
const color = pct < 50 ? '#22c55e' : pct < 80 ? '#f59e0b' : '#ef4444';
return (
<View style={{ backgroundColor: color, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
<Text style={{ color: 'white', fontWeight: '600' }}>{occupancy}/{capacity}</Text>
</View>
);
}