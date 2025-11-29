import React, { useEffect, useRef } from "react";
import api from "../services/admin";
import { getRoute } from "../services/routes";

export type DemandPoint = {
  lat: number;
  lon: number;
  waiting: number;
  high: boolean;
  stop_id?: string;
  stop_name?: string;
  sequence?: number;
};

export default function DemandLayer(props: {
  routeId?: string;
  direction: "to" | "fro";
  onData: (points: DemandPoint[]) => void;
}) {
  const { routeId, direction, onData } = props;

  const onDataRef = useRef(onData);
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    let timer: any = null;
    let cancelled = false;
    let delayMs = 10000; // base poll interval

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (cancelled) return;

      if (!routeId) {
        onDataRef.current?.([]);
        schedule();
        return;
      }

      try {
        // 1) Route details => ordered stops & coords
        const route = await getRoute(routeId);

        // 2) Reservation summary
        const summaryRes = await api.get(
          `/routes/${routeId}/reservations/summary`,
          { params: { direction } }
        );

        if (cancelled) return;

        const dirStops = (route?.directions?.[direction] || []) as any[];

        const stops = dirStops.map((s, idx) => ({
          stop_id: s.stop_id || s.id || `${routeId}_${direction}_${idx}`,
          stop_name: s.stop_name || s.name || `Stop ${idx + 1}`,
          sequence:
            typeof s.sequence === "number" && Number.isFinite(s.sequence)
              ? s.sequence
              : idx,
          lat:
            typeof s.lat === "number"
              ? s.lat
              : s.location?.latitude ?? null,
          lon:
            typeof s.lon === "number"
              ? s.lon
              : s.location?.longitude ?? null,
        }));

        const waitingBySeq: Record<number, number> = {};
        const sumData = summaryRes.data || {};
        const summaryStops: any[] = Array.isArray(sumData.stops)
          ? sumData.stops
          : [];

        summaryStops.forEach((s) => {
          const seq = Number(
            s.sequence ?? s.source_sequence ?? s.dest_sequence
          );
          const count = Number(
            s.waiting_count ?? s.waiting ?? s.count ?? 0
          );
          if (Number.isFinite(seq) && count > 0) {
            waitingBySeq[seq] = (waitingBySeq[seq] || 0) + count;
          }
        });

        const points: DemandPoint[] = stops
          .filter(
            (s) =>
              typeof s.lat === "number" &&
              typeof s.lon === "number" &&
              !Number.isNaN(s.lat) &&
              !Number.isNaN(s.lon)
          )
          .map((s) => {
            const waiting = waitingBySeq[s.sequence] || 0;
            return {
              lat: s.lat as number,
              lon: s.lon as number,
              waiting,
              high: waiting >= 4, // tweak threshold if needed
              stop_id: s.stop_id,
              stop_name: s.stop_name,
              sequence: s.sequence,
            };
          })
          .filter((p) => p.waiting > 0);

        onDataRef.current?.(points);

        // success -> reset backoff
        delayMs = 10000;
      } catch (err: any) {
        console.error("[Admin API error] GET demand summary failed", err);

        // gentle exponential backoff on repeated failures
        delayMs = Math.min(delayMs * 2, 60000);
      } finally {
        schedule();
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [routeId, direction]);

  return null;
}
